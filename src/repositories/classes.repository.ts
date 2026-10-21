import { SupabaseClient } from "@supabase/supabase-js";
import { BaseRepository } from "./base-repository";
import type {
  ClassCharge,
  ClassEnrollment,
  ClassPaymentMethodRef,
  ClassPlayerRef,
  ClassProfessor,
  ClassSchedule,
  ClassSession,
  MissingClassRateView,
} from "@/models/db/class";
import { CLASS_CASH_PAYMENT_METHOD_NAME, CLASS_CINTIA_PAYMENT_METHOD_NAME, CLASS_PAYMENT_METHOD_NAMES, CLASS_PROFESSOR_PAYMENT_METHOD_NAMES, CLASSES_SQL_HINT } from "@/lib/class-payment-methods";
import { splitClassCollection } from "@/lib/class-collection-split";
import { planMonthlyCharges } from "@/lib/class-monthly-charge";
import {
  isMissingClassesScope,
  isMissingRelation,
  type OccupancySession,
} from "@/lib/class-occupancy";
import { ClassRequestError } from "@/lib/class-request-error";
import {
  CLASS_DURATION_MINUTES,
  CLASS_PLAYER_LIMIT,
  classFitsInDay,
  addDaysIso,
  eachDate,
  endTimeAfter,
  enrollmentOnClassDay,
  isIsoDate,
  isYearMonth,
  normalizeTime,
  rangesOverlap,
  todayInArgentina,
  weekdayOf,
} from "@/lib/class-time";

type DbError = { message: string; code?: string };

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function playerName(player: { first_name?: string; last_name?: string } | null): string {
  if (!player) return "Jugador";
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Jugador";
}

function isMissingClosureProfessor(error: DbError): boolean {
  const message = (error.message ?? "").toLowerCase();
  return message.includes("professor_id") && (message.includes("does not exist") || message.includes("schema cache"));
}

function isMissingAccountColumn(error: DbError): boolean {
  const message = (error.message ?? "").toLowerCase();
  return message.includes("account") && (message.includes("does not exist") || message.includes("schema cache"));
}

export class ClassesRepository extends BaseRepository {
  constructor(supabase: SupabaseClient, userId: string) {
    super(supabase, userId);
  }

  private fail(error: DbError): Error {
    if (isMissingRelation(error) || isMissingClassesScope(error)) {
      return new ClassRequestError(CLASSES_SQL_HINT, 503);
    }
    return new Error(error.message);
  }

  async ensureClassPaymentMethods(): Promise<ClassPaymentMethodRef[]> {
    const names: string[] = [...CLASS_PAYMENT_METHOD_NAMES];
    const professorNames: readonly string[] = CLASS_PROFESSOR_PAYMENT_METHOD_NAMES;
    const listed = await this.supabase
      .from("payment_methods")
      .select("id, name, scope, is_active, account")
      .eq("user_uid", this.userId)
      .in("name", names);
    const hasAccount = !listed.error || !isMissingAccountColumn(listed.error);
    const { data, error } = hasAccount
      ? listed
      : await this.supabase
          .from("payment_methods")
          .select("id, name, scope, is_active")
          .eq("user_uid", this.userId)
          .in("name", names);

    if (error) throw this.fail(error);

    const found = new Map((data ?? []).map((row) => [row.name as string, row]));
    for (const name of names) {
      const row = found.get(name);
      const account = professorNames.includes(name) ? name : null;
      if (!row) {
        const created = await this.supabase
          .from("payment_methods")
          .insert({
            name,
            scope: "CLASSES",
            is_active: true,
            user_uid: this.userId,
            ...(hasAccount ? { account } : {}),
          })
          .select("id, name")
          .single();
        if (created.error) throw this.fail(created.error);
        continue;
      }
      const currentAccount = "account" in row ? (row.account as string | null) : null;
      const needsAccount = hasAccount && professorNames.includes(name) && !currentAccount?.trim();
      if (row.scope !== "CLASSES" || row.is_active !== true || needsAccount) {
        const updated = await this.supabase
          .from("payment_methods")
          .update({
            scope: "CLASSES",
            is_active: true,
            ...(needsAccount ? { account } : {}),
          })
          .eq("id", row.id);
        if (updated.error) throw this.fail(updated.error);
      }
    }

    const methodsQuery = this.supabase
      .from("payment_methods")
      .select(hasAccount ? "id, name, account" : "id, name")
      .eq("user_uid", this.userId)
      .eq("scope", "CLASSES")
      .eq("is_active", true)
      .order("name");
    const { data: methods, error: listError } = await methodsQuery;
    if (listError) throw this.fail(listError);
    return (methods ?? []).map((row) => ({
      id: row.id as number,
      name: row.name as string,
      account: "account" in row ? ((row.account as string | null) ?? null) : null,
    }));
  }

  async listProfessors(): Promise<{
    professors: ClassProfessor[];
    paymentMethods: ClassPaymentMethodRef[];
    cashPaymentMethod: ClassPaymentMethodRef | null;
    cintiaPaymentMethod: ClassPaymentMethodRef | null;
  }> {
    const methods = await this.ensureClassPaymentMethods();
    const cashPaymentMethod = methods.find((method) => method.name === CLASS_CASH_PAYMENT_METHOD_NAME) ?? null;
    const cintiaPaymentMethod = methods.find((method) => method.name === CLASS_CINTIA_PAYMENT_METHOD_NAME) ?? null;
    const professorMethodNames: readonly string[] = CLASS_PROFESSOR_PAYMENT_METHOD_NAMES;
    const paymentMethods = methods.filter((method) => professorMethodNames.includes(method.name));
    const { data, error } = await this.supabase
      .from("class_professors")
      .select(
        `
        id, name, phone, payment_method_id, is_active,
        payment_method:payment_method_id (id, name),
        rates:class_professor_rates (id, weekly_count, monthly_amount)
      `
      )
      .order("name");
    if (error) throw this.fail(error);

    const professors = (data ?? []).map((row) => {
      const payment = one(
        row.payment_method as ClassPaymentMethodRef | ClassPaymentMethodRef[] | null
      );
      const rates = (Array.isArray(row.rates) ? row.rates : []).map((rate) => ({
        id: rate.id as number,
        weekly_count: asNumber(rate.weekly_count),
        monthly_amount: asNumber(rate.monthly_amount),
      }));
      rates.sort((a, b) => a.weekly_count - b.weekly_count);
      return {
        id: row.id as number,
        name: row.name as string,
        phone: (row.phone as string | null) ?? null,
        payment_method_id: (row.payment_method_id as number | null) ?? null,
        is_active: Boolean(row.is_active),
        payment_method: payment
          ? {
              id: payment.id,
              name: payment.name,
              account: methods.find((method) => method.id === payment.id)?.account ?? payment.account ?? null,
            }
          : null,
        rates,
      };
    });

    return { professors, paymentMethods, cashPaymentMethod, cintiaPaymentMethod };
  }

  async createProfessor(input: {
    name: string;
    phone?: string | null;
    paymentMethodId: number;
  }): Promise<ClassProfessor> {
    await this.assertClassPaymentMethod(input.paymentMethodId);
    const name = input.name.trim();
    if (!name) throw new ClassRequestError("El nombre es obligatorio");
    const { data, error } = await this.supabase
      .from("class_professors")
      .insert({
        user_uid: this.userId,
        name,
        phone: input.phone?.trim() || null,
        payment_method_id: input.paymentMethodId,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw this.fail(error);
    const listed = await this.listProfessors();
    const created = listed.professors.find((professor) => professor.id === data.id);
    if (!created) throw new Error("No se pudo leer el profesor");
    return created;
  }

  async updateProfessor(
    id: number,
    patch: {
      name?: string;
      phone?: string | null;
      paymentMethodId?: number;
      paymentAccount?: string | null;
      isActive?: boolean;
    }
  ): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ClassRequestError("El nombre es obligatorio");
      updates.name = name;
    }
    if (patch.phone !== undefined) updates.phone = patch.phone?.trim() || null;
    if (patch.paymentMethodId !== undefined) {
      await this.assertClassPaymentMethod(patch.paymentMethodId);
      updates.payment_method_id = patch.paymentMethodId;
    }
    if (patch.isActive !== undefined) updates.is_active = patch.isActive;
    if (Object.keys(updates).length === 0 && patch.paymentAccount === undefined) {
      throw new ClassRequestError("No hay cambios");
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await this.supabase.from("class_professors").update(updates).eq("id", id);
      if (error) throw this.fail(error);
    }
    if (patch.paymentAccount !== undefined) {
      const methodId = patch.paymentMethodId ?? (await this.professorPaymentMethodId(id));
      if (!methodId) throw new ClassRequestError("Elegí el medio de pago del profesor");
      await this.assertClassPaymentMethod(methodId);
      const account = patch.paymentAccount?.trim() || null;
      const { error } = await this.supabase
        .from("payment_methods")
        .update({ account })
        .eq("id", methodId)
        .eq("user_uid", this.userId);
      if (error) {
        if (isMissingAccountColumn(error)) throw new ClassRequestError(CLASSES_SQL_HINT, 503);
        throw this.fail(error);
      }
    }
  }

  private async professorPaymentMethodId(id: number): Promise<number | null> {
    const { data, error } = await this.supabase
      .from("class_professors")
      .select("payment_method_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    return (data?.payment_method_id as number | null) ?? null;
  }

  async saveRate(professorId: number, weeklyCount: number, monthlyAmount: number): Promise<void> {
    if (!Number.isInteger(weeklyCount) || weeklyCount < 1) {
      throw new ClassRequestError("La cantidad de clases por semana tiene que ser 1 o más");
    }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
      throw new ClassRequestError("El monto no es válido");
    }
    const { data: existing, error: findError } = await this.supabase
      .from("class_professor_rates")
      .select("id")
      .eq("professor_id", professorId)
      .eq("weekly_count", weeklyCount)
      .maybeSingle();
    if (findError) throw this.fail(findError);

    if (existing) {
      const { error } = await this.supabase
        .from("class_professor_rates")
        .update({ monthly_amount: monthlyAmount })
        .eq("id", existing.id);
      if (error) throw this.fail(error);
      return;
    }

    const { error } = await this.supabase.from("class_professor_rates").insert({
      user_uid: this.userId,
      professor_id: professorId,
      weekly_count: weeklyCount,
      monthly_amount: monthlyAmount,
    });
    if (error) throw this.fail(error);
  }

  async deleteRate(id: number): Promise<void> {
    const { error } = await this.supabase.from("class_professor_rates").delete().eq("id", id);
    if (error) throw this.fail(error);
  }

  async listSchedules(): Promise<ClassSchedule[]> {
    const { data, error } = await this.supabase
      .from("class_schedules")
      .select(
        `
        id, professor_id, court_id, weekday, start_time, duration_minutes, name, is_active,
        professor:professor_id (id, name),
        court:court_id (id, name),
        enrollments:class_enrollments (
          id, player_id, started_on, ended_on,
          player:player_id (id, first_name, last_name)
        )
      `
      )
      .order("weekday")
      .order("start_time");
    if (error) throw this.fail(error);

    return (data ?? []).map((row) => {
      const enrollments = (Array.isArray(row.enrollments) ? row.enrollments : [])
        .filter((enrollment) => !enrollment.ended_on)
        .map((enrollment) => this.mapEnrollment(enrollment));
      enrollments.sort((a, b) =>
        playerName(a.player).localeCompare(playerName(b.player), "es")
      );
      return {
        id: row.id as number,
        professor_id: row.professor_id as number,
        court_id: row.court_id as number,
        weekday: row.weekday as number,
        start_time: row.start_time as string,
        duration_minutes: asNumber(row.duration_minutes) || CLASS_DURATION_MINUTES,
        name: (row.name as string | null) ?? null,
        is_active: Boolean(row.is_active),
        professor: one(row.professor as { id: number; name: string } | { id: number; name: string }[] | null),
        court: one(row.court as { id: number; name: string } | { id: number; name: string }[] | null),
        enrollments,
      };
    });
  }

  async createSchedule(input: {
    professorId: number;
    courtId: number;
    weekday: number;
    startTime: string;
    name?: string | null;
    playerIds?: number[];
  }): Promise<number> {
    if (!Number.isInteger(input.professorId) || input.professorId <= 0) {
      throw new ClassRequestError("Elegí un profesor");
    }
    if (!Number.isInteger(input.courtId) || input.courtId <= 0) {
      throw new ClassRequestError("Elegí una cancha");
    }
    const playerIds = Array.from(new Set(input.playerIds ?? []));
    if (playerIds.length > CLASS_PLAYER_LIMIT) {
      throw new ClassRequestError("Una clase tiene como máximo 5 jugadores");
    }
    const start = this.requireStart(input.startTime);
    this.requireWeekday(input.weekday);
    this.requireInsideDay(start);
    const end = endTimeAfter(start, CLASS_DURATION_MINUTES);
    await this.assertScheduleFree(input.courtId, input.professorId, input.weekday, start, end);
    const { data, error } = await this.supabase
      .from("class_schedules")
      .insert({
        user_uid: this.userId,
        professor_id: input.professorId,
        court_id: input.courtId,
        weekday: input.weekday,
        start_time: start,
        duration_minutes: CLASS_DURATION_MINUTES,
        name: input.name?.trim() || null,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw this.fail(error);

    if (playerIds.length > 0) {
      const startedOn = todayInArgentina();
      const { error: enrollError } = await this.supabase.from("class_enrollments").insert(
        playerIds.map((playerId) => ({
          user_uid: this.userId,
          schedule_id: data.id,
          player_id: playerId,
          started_on: startedOn,
        }))
      );
      if (enrollError) {
        if (enrollError.code === "23503") throw new ClassRequestError("Hay un jugador que no existe");
        throw this.fail(enrollError);
      }
    }

    return data.id as number;
  }

  async updateSchedule(
    id: number,
    patch: {
      professorId?: number;
      courtId?: number;
      weekday?: number;
      startTime?: string;
      name?: string | null;
      isActive?: boolean;
    }
  ): Promise<void> {
    const current = await this.requireSchedule(id);
    const weekday = patch.weekday ?? current.weekday;
    const courtId = patch.courtId ?? current.court_id;
    const professorId = patch.professorId ?? current.professor_id;
    const start = patch.startTime ? this.requireStart(patch.startTime) : current.start_time;
    this.requireWeekday(weekday);
    this.requireInsideDay(start);
    const end = endTimeAfter(start, CLASS_DURATION_MINUTES);
    const isActive = patch.isActive ?? current.is_active;
    if (isActive) await this.assertScheduleFree(courtId, professorId, weekday, start, end, id);

    const { error } = await this.supabase
      .from("class_schedules")
      .update({
        professor_id: professorId,
        court_id: courtId,
        weekday,
        start_time: start,
        name: patch.name !== undefined ? patch.name?.trim() || null : current.name,
        is_active: isActive,
      })
      .eq("id", id);
    if (error) throw this.fail(error);

    const today = todayInArgentina();
    if (!isActive || weekday !== current.weekday) {
      const { error: dropError } = await this.supabase
        .from("class_sessions")
        .delete()
        .eq("schedule_id", id)
        .gte("session_date", today)
        .eq("detached", false)
        .eq("roster_customized", false);
      if (dropError) throw this.fail(dropError);
      return;
    }

    const { error: moveError } = await this.supabase
      .from("class_sessions")
      .update({
        court_id: courtId,
        start_time: start,
        end_time: end,
        professor_id: professorId,
      })
      .eq("schedule_id", id)
      .gte("session_date", today)
      .eq("detached", false)
      .eq("status", "scheduled");
    if (moveError) throw this.fail(moveError);
  }

  async addEnrollment(scheduleId: number, playerId: number): Promise<void> {
    await this.requireSchedule(scheduleId);
    const { data: openRow, error: openError } = await this.supabase
      .from("class_enrollments")
      .select("id")
      .eq("schedule_id", scheduleId)
      .eq("player_id", playerId)
      .is("ended_on", null)
      .maybeSingle();
    if (openError) throw this.fail(openError);
    if (openRow) throw new ClassRequestError("Ese jugador ya está en la clase");

    const { data: openRows, error: countError } = await this.supabase
      .from("class_enrollments")
      .select("id")
      .eq("schedule_id", scheduleId)
      .is("ended_on", null);
    if (countError) throw this.fail(countError);
    if ((openRows?.length ?? 0) >= CLASS_PLAYER_LIMIT) {
      throw new ClassRequestError("La clase ya tiene 5 jugadores");
    }

    const { error } = await this.supabase.from("class_enrollments").insert({
      user_uid: this.userId,
      schedule_id: scheduleId,
      player_id: playerId,
      started_on: todayInArgentina(),
    });
    if (error) {
      if (error.code === "23503") throw new ClassRequestError("Jugador no encontrado");
      throw this.fail(error);
    }
  }

  async endEnrollment(id: number): Promise<void> {
    const today = todayInArgentina();
    const { data: current, error: readError } = await this.supabase
      .from("class_enrollments")
      .select("id, started_on")
      .eq("id", id)
      .is("ended_on", null)
      .maybeSingle();
    if (readError) throw this.fail(readError);
    if (!current) throw new ClassRequestError("El integrante ya no está en la clase");
    const startedOn = String(current.started_on).slice(0, 10);
    const endedOn = startedOn < today ? addDaysIso(today, -1) : today;
    const { error } = await this.supabase
      .from("class_enrollments")
      .update({ ended_on: endedOn })
      .eq("id", id);
    if (error) throw this.fail(error);
  }

  async listSessions(from: string, to: string): Promise<ClassSession[]> {
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      throw new ClassRequestError("El rango de fechas no es válido");
    }
    if (eachDate(from, to).length > 31) {
      throw new ClassRequestError("El rango no puede pasar de 31 días");
    }
    await this.ensureSessions(from, to);
    return this.fetchSessions(from, to);
  }

  /** Sesiones del día para marcar turnos ocupados. Si las tablas no existen, no hay clases. */
  async listOccupancy(date: string): Promise<OccupancySession[]> {
    if (isIsoDate(date)) {
      try {
        await this.ensureSessions(date, date);
      } catch (error) {
        if (error instanceof ClassRequestError && error.status === 503) return [];
        throw error;
      }
    }
    const { data, error } = await this.supabase
      .from("class_sessions")
      .select(
        `
        court_id, start_time, end_time, status,
        professor:professor_id (name),
        schedule:schedule_id (name)
      `
      )
      .eq("session_date", date)
      .eq("status", "scheduled");
    if (error) {
      if (isMissingRelation(error)) return [];
      throw this.fail(error);
    }
    return (data ?? []).map((row) => {
      const schedule = one(row.schedule as { name: string | null } | { name: string | null }[] | null);
      const professor = one(row.professor as { name: string } | { name: string }[] | null);
      return {
        courtId: row.court_id as number,
        startTime: row.start_time as string,
        endTime: row.end_time as string,
        status: row.status as string,
        label: schedule?.name?.trim() || professor?.name?.trim() || "Clase",
      };
    });
  }

  async updateSession(
    id: number,
    patch: { courtId?: number; status?: "scheduled" | "cancelled"; reset?: boolean }
  ): Promise<void> {
    const session = await this.requireSession(id);
    if (patch.reset || (patch.status === "scheduled" && session.status === "cancelled" && !patch.courtId)) {
      const schedule = await this.requireSchedule(session.schedule_id);
      const end = endTimeAfter(schedule.start_time, schedule.duration_minutes);
      await this.assertSessionFree(schedule.court_id, session.session_date, schedule.start_time, end, id);
      const { error } = await this.supabase
        .from("class_sessions")
        .update({
          status: "scheduled",
          court_id: schedule.court_id,
          start_time: schedule.start_time,
          end_time: end,
          professor_id: schedule.professor_id,
          detached: false,
        })
        .eq("id", id);
      if (error) throw this.fail(error);
      return;
    }

    if (patch.status === "cancelled") {
      const { error } = await this.supabase
        .from("class_sessions")
        .update({ status: "cancelled", detached: true })
        .eq("id", id);
      if (error) throw this.fail(error);
      return;
    }

    if (patch.courtId !== undefined) {
      await this.assertSessionFree(patch.courtId, session.session_date, session.start_time, session.end_time, id);
      const schedule = await this.requireSchedule(session.schedule_id);
      const { error } = await this.supabase
        .from("class_sessions")
        .update({
          court_id: patch.courtId,
          detached: patch.courtId !== schedule.court_id,
        })
        .eq("id", id);
      if (error) throw this.fail(error);
    }
  }

  async setSessionPlayers(id: number, playerIds: number[]): Promise<void> {
    await this.requireSession(id);
    const uniqueIds = Array.from(new Set(playerIds));
    if (uniqueIds.length > CLASS_PLAYER_LIMIT) {
      throw new ClassRequestError("Una clase tiene como máximo 5 jugadores");
    }
    const { error: deleteError } = await this.supabase
      .from("class_session_players")
      .delete()
      .eq("session_id", id);
    if (deleteError) throw this.fail(deleteError);
    if (uniqueIds.length > 0) {
      const { error } = await this.supabase.from("class_session_players").insert(
        uniqueIds.map((playerId) => ({
          user_uid: this.userId,
          session_id: id,
          player_id: playerId,
        }))
      );
      if (error) {
        if (error.code === "23503") throw new ClassRequestError("Hay un jugador que no existe");
        throw this.fail(error);
      }
    }
    const { error } = await this.supabase
      .from("class_sessions")
      .update({ roster_customized: true })
      .eq("id", id);
    if (error) throw this.fail(error);
  }

  async listCharges(yearMonth: string): Promise<ClassCharge[]> {
    if (!isYearMonth(yearMonth)) throw new ClassRequestError("El mes no es válido");
    const { data, error } = await this.supabase
      .from("class_charges")
      .select(
        `
        id, player_id, professor_id, year_month, weekly_count, amount, status, paid_at,
        professor_share, partners_share, emanuel_share,
        payment_method:payment_method_id (id, name),
        player:player_id (id, first_name, last_name, phone),
        professor:professor_id (id, name)
      `
      )
      .eq("year_month", yearMonth);
    if (error) throw this.fail(error);
    return (data ?? []).map((row) => this.mapCharge(row)).sort((a, b) => {
      const professor = (a.professor?.name ?? "").localeCompare(b.professor?.name ?? "", "es");
      if (professor !== 0) return professor;
      return playerName(a.player).localeCompare(playerName(b.player), "es");
    });
  }

  async generateCharges(yearMonth: string): Promise<{
    charges: ClassCharge[];
    missing: MissingClassRateView[];
  }> {
    if (!isYearMonth(yearMonth)) throw new ClassRequestError("El mes no es válido");
    const closedProfessors = new Set(await this.closedProfessorIds(yearMonth));
    await this.ensureClassPaymentMethods();

    const [enrollmentRes, scheduleRes, professorRes, rateRes, chargeRes] = await Promise.all([
      this.supabase
        .from("class_enrollments")
        .select("player_id, schedule_id, started_on, ended_on, player:player_id (first_name, last_name)"),
      this.supabase.from("class_schedules").select("id, professor_id"),
      this.supabase.from("class_professors").select("id, name, payment_method_id"),
      this.supabase.from("class_professor_rates").select("professor_id, weekly_count, monthly_amount"),
      this.supabase
        .from("class_charges")
        .select("player_id, professor_id, status")
        .eq("year_month", yearMonth),
    ]);
    for (const result of [enrollmentRes, scheduleRes, professorRes, rateRes, chargeRes]) {
      if (result.error) throw this.fail(result.error);
    }

    const scheduleProfessor = new Map<number, number>();
    for (const row of scheduleRes.data ?? []) {
      scheduleProfessor.set(row.id as number, row.professor_id as number);
    }
    const professors = new Map<number, { name: string; paymentMethodId: number | null }>();
    for (const row of professorRes.data ?? []) {
      professors.set(row.id as number, {
        name: row.name as string,
        paymentMethodId: (row.payment_method_id as number | null) ?? null,
      });
    }
    const playerNames = new Map<number, string>();
    const enrollments = [];
    for (const row of enrollmentRes.data ?? []) {
      const professorId = scheduleProfessor.get(row.schedule_id as number);
      if (!professorId) continue;
      const player = one(row.player as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null);
      playerNames.set(row.player_id as number, playerName(player));
      enrollments.push({
        playerId: row.player_id as number,
        professorId,
        scheduleId: row.schedule_id as number,
        startedOn: String(row.started_on).slice(0, 10),
        endedOn: row.ended_on ? String(row.ended_on).slice(0, 10) : null,
      });
    }

    const plan = planMonthlyCharges(
      yearMonth,
      enrollments,
      (rateRes.data ?? []).map((row) => ({
        professorId: row.professor_id as number,
        weeklyCount: asNumber(row.weekly_count),
        amount: asNumber(row.monthly_amount),
      })),
      (chargeRes.data ?? []).map((row) => ({
        playerId: row.player_id as number,
        professorId: row.professor_id as number,
        status: row.status === "paid" ? "paid" : "pending",
      }))
    );

    for (const draft of plan.drafts) {
      if (closedProfessors.has(draft.professorId)) continue;
      const professor = professors.get(draft.professorId);
      if (!professor?.paymentMethodId) {
        throw new ClassRequestError(
          `A ${professor?.name ?? "un profesor"} le falta el medio de pago de clases`
        );
      }
      if (draft.action === "update") {
        const { error } = await this.supabase
          .from("class_charges")
          .update({
            weekly_count: draft.weeklyCount,
            payment_method_id: professor.paymentMethodId,
          })
          .eq("player_id", draft.playerId)
          .eq("professor_id", draft.professorId)
          .eq("year_month", yearMonth)
          .eq("status", "pending");
        if (error) throw this.fail(error);
      } else {
        const { error } = await this.supabase.from("class_charges").insert({
          user_uid: this.userId,
          player_id: draft.playerId,
          professor_id: draft.professorId,
          year_month: yearMonth,
          weekly_count: draft.weeklyCount,
          amount: draft.amount,
          payment_method_id: professor.paymentMethodId,
          status: "pending",
        });
        if (error) throw this.fail(error);
      }
    }

    const stillDue = new Set(
      [...plan.drafts, ...plan.missing].map((row) => `${row.playerId}:${row.professorId}`)
    );
    for (const row of chargeRes.data ?? []) {
      if (row.status === "paid") continue;
      if (closedProfessors.has(row.professor_id as number)) continue;
      const key = `${row.player_id}:${row.professor_id}`;
      if (stillDue.has(key)) continue;
      const { error } = await this.supabase
        .from("class_charges")
        .delete()
        .eq("player_id", row.player_id)
        .eq("professor_id", row.professor_id)
        .eq("year_month", yearMonth)
        .eq("status", "pending");
      if (error) throw this.fail(error);
    }

    const charges = await this.listCharges(yearMonth);
    return {
      charges,
      missing: plan.missing.map((row) => ({
        player_id: row.playerId,
        professor_id: row.professorId,
        player_name: playerNames.get(row.playerId) ?? "Jugador",
        professor_name: professors.get(row.professorId)?.name ?? "Profesor",
        weekly_count: row.weeklyCount,
      })),
    };
  }

  async payCharge(id: number, paymentMethodId?: number): Promise<ClassCharge> {
    const { data, error } = await this.supabase
      .from("class_charges")
      .select(
        `
        id, player_id, professor_id, year_month, weekly_count, amount, status, payment_method_id,
        player:player_id (first_name, last_name),
        professor:professor_id (name, payment_method_id)
      `
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    if (!data) throw new ClassRequestError("No se encontró la deuda", 404);
    if (data.status === "paid") throw new ClassRequestError("Esa deuda ya está paga");
    if (await this.isProfessorMonthClosed(String(data.year_month), data.professor_id as number)) {
      throw new ClassRequestError("El mes de ese profesor ya está cerrado");
    }

    const professor = one(
      data.professor as
        | { name: string; payment_method_id: number | null }
        | { name: string; payment_method_id: number | null }[]
        | null
    );
    const chosenMethodId = paymentMethodId ?? (data.payment_method_id as number | null);
    if (!chosenMethodId) throw new ClassRequestError("Elegí el medio de pago");
    await this.assertChargePaymentMethod(chosenMethodId, [
      data.payment_method_id as number | null,
      professor?.payment_method_id ?? null,
    ]);

    const amount = asNumber(data.amount);
    const shares = splitClassCollection(amount);
    const player = one(data.player as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null);
    let transactionId: number | null = null;
    if (amount > 0) {
      const { data: tx, error: txError } = await this.supabase
        .from("transactions")
        .insert({
          user_uid: this.userId,
          player_id: data.player_id,
          payment_method_id: chosenMethodId,
          amount,
          type: "income",
          status: "completed",
          description: `Clases ${data.year_month} · ${professor?.name ?? "Profesor"} · ${playerName(player)}`,
        })
        .select("id")
        .single();
      if (txError) throw this.fail(txError);
      transactionId = tx.id as number;
    }

    const { error: payError } = await this.supabase
      .from("class_charges")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        transaction_id: transactionId,
        payment_method_id: chosenMethodId,
        professor_share: shares.professorShare,
        partners_share: shares.partnersShare,
        emanuel_share: shares.emanuelShare,
      })
      .eq("id", id)
      .eq("status", "pending");
    if (payError) throw this.fail(payError);

    const charges = await this.listCharges(String(data.year_month));
    const paid = charges.find((charge) => charge.id === id);
    if (!paid) throw new Error("No se pudo leer el cobro");
    return paid;
  }

  async updatePayment(id: number, amount: number, paymentMethodId: number): Promise<ClassCharge> {
    if (!Number.isFinite(amount) || amount < 0) throw new ClassRequestError("El monto no es válido");
    if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
      throw new ClassRequestError("Elegí dónde se pagó");
    }
    const { data, error } = await this.supabase
      .from("class_charges")
      .select(
        `
        id, player_id, professor_id, year_month, status, transaction_id, payment_method_id,
        player:player_id (first_name, last_name),
        professor:professor_id (name, payment_method_id)
      `
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    if (!data) throw new ClassRequestError("No se encontró la deuda", 404);
    if (data.status !== "paid") throw new ClassRequestError("Esa deuda todavía no está paga");
    if (await this.isProfessorMonthClosed(String(data.year_month), data.professor_id as number)) {
      throw new ClassRequestError("El mes de ese profesor ya está cerrado");
    }

    const professor = one(
      data.professor as
        | { name: string; payment_method_id: number | null }
        | { name: string; payment_method_id: number | null }[]
        | null
    );
    await this.assertChargePaymentMethod(paymentMethodId, [
      data.payment_method_id as number | null,
      professor?.payment_method_id ?? null,
    ]);

    const shares = splitClassCollection(amount);
    const player = one(
      data.player as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
    );
    let transactionId = (data.transaction_id as number | null) ?? null;
    if (amount > 0) {
      if (transactionId) {
        const { error: txError } = await this.supabase
          .from("transactions")
          .update({ amount, payment_method_id: paymentMethodId })
          .eq("id", transactionId);
        if (txError) throw this.fail(txError);
      } else {
        const { data: tx, error: txError } = await this.supabase
          .from("transactions")
          .insert({
            user_uid: this.userId,
            player_id: data.player_id,
            payment_method_id: paymentMethodId,
            amount,
            type: "income",
            status: "completed",
            description: `Clases ${data.year_month} · ${professor?.name ?? "Profesor"} · ${playerName(player)}`,
          })
          .select("id")
          .single();
        if (txError) throw this.fail(txError);
        transactionId = tx.id as number;
      }
    } else if (transactionId) {
      const previousId = transactionId;
      transactionId = null;
      const { error: clearError } = await this.supabase
        .from("class_charges")
        .update({ transaction_id: null })
        .eq("id", id);
      if (clearError) throw this.fail(clearError);
      const { error: deleteError } = await this.supabase.from("transactions").delete().eq("id", previousId);
      if (deleteError) throw this.fail(deleteError);
    }

    const { error: updateError } = await this.supabase
      .from("class_charges")
      .update({
        amount,
        payment_method_id: paymentMethodId,
        transaction_id: transactionId,
        professor_share: shares.professorShare,
        partners_share: shares.partnersShare,
        emanuel_share: shares.emanuelShare,
      })
      .eq("id", id)
      .eq("status", "paid");
    if (updateError) throw this.fail(updateError);

    const charges = await this.listCharges(String(data.year_month));
    const updated = charges.find((charge) => charge.id === id);
    if (!updated) throw new Error("No se pudo leer el cobro");
    return updated;
  }

  async updateChargeAmount(id: number, amount: number): Promise<ClassCharge> {
    if (!Number.isFinite(amount) || amount < 0) throw new ClassRequestError("El monto no es válido");
    const { data, error } = await this.supabase
      .from("class_charges")
      .select("id, professor_id, year_month, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    if (!data) throw new ClassRequestError("No se encontró la deuda", 404);
    if (data.status === "paid") throw new ClassRequestError("Esa deuda ya está paga");
    if (await this.isProfessorMonthClosed(String(data.year_month), data.professor_id as number)) {
      throw new ClassRequestError("El mes de ese profesor ya está cerrado");
    }
    const { error: updateError } = await this.supabase
      .from("class_charges")
      .update({ amount })
      .eq("id", id)
      .eq("status", "pending");
    if (updateError) throw this.fail(updateError);
    const charges = await this.listCharges(String(data.year_month));
    const updated = charges.find((charge) => charge.id === id);
    if (!updated) throw new Error("No se pudo leer el cobro");
    return updated;
  }

  async closedProfessorIds(yearMonth: string): Promise<number[]> {
    if (!isYearMonth(yearMonth)) throw new ClassRequestError("El mes no es válido");
    const { data, error } = await this.supabase
      .from("class_month_closures")
      .select("professor_id")
      .eq("user_uid", this.userId)
      .eq("year_month", yearMonth);
    if (error) {
      if (isMissingRelation(error) || isMissingClosureProfessor(error)) return [];
      throw this.fail(error);
    }
    return (data ?? [])
      .map((row) => row.professor_id as number | null)
      .filter((id): id is number => typeof id === "number");
  }

  async setMonthClosed(yearMonth: string, professorId: number, closed: boolean): Promise<void> {
    if (!isYearMonth(yearMonth)) throw new ClassRequestError("El mes no es válido");
    if (!Number.isInteger(professorId) || professorId <= 0) throw new ClassRequestError("Elegí un profesor");
    if (closed) {
      const { error } = await this.supabase.from("class_month_closures").insert({
        user_uid: this.userId,
        professor_id: professorId,
        year_month: yearMonth,
      });
      if (error) {
        if (error.code === "23505") return;
        if (isMissingRelation(error) || isMissingClosureProfessor(error)) {
          throw new ClassRequestError(CLASSES_SQL_HINT, 503);
        }
        throw this.fail(error);
      }
      return;
    }
    const { error } = await this.supabase
      .from("class_month_closures")
      .delete()
      .eq("user_uid", this.userId)
      .eq("year_month", yearMonth)
      .eq("professor_id", professorId);
    if (error) {
      if (isMissingRelation(error) || isMissingClosureProfessor(error)) {
        throw new ClassRequestError(CLASSES_SQL_HINT, 503);
      }
      throw this.fail(error);
    }
  }

  private async isProfessorMonthClosed(yearMonth: string, professorId: number): Promise<boolean> {
    const closed = await this.closedProfessorIds(yearMonth);
    return closed.includes(professorId);
  }

  private async assertChargePaymentMethod(id: number, allowedIds: Array<number | null>): Promise<void> {
    const { data, error } = await this.supabase
      .from("payment_methods")
      .select("id, name, scope, is_active")
      .eq("id", id)
      .eq("user_uid", this.userId)
      .maybeSingle();
    if (error) throw this.fail(error);
    const isCash = data?.name === CLASS_CASH_PAYMENT_METHOD_NAME;
    const isCintia = data?.name === CLASS_CINTIA_PAYMENT_METHOD_NAME;
    const isProfessorMethod = allowedIds.includes(id);
    if (!data || data.scope !== "CLASSES" || data.is_active === false || (!isCash && !isCintia && !isProfessorMethod)) {
      throw new ClassRequestError("Elegí transferencia al profe, transferencia Cintia o efectivo");
    }
  }

  private async assertClassPaymentMethod(id: number): Promise<void> {
    const { data, error } = await this.supabase
      .from("payment_methods")
      .select("id, name, scope, is_active")
      .eq("id", id)
      .eq("user_uid", this.userId)
      .maybeSingle();
    if (error) throw this.fail(error);
    const professorNames: readonly string[] = CLASS_PROFESSOR_PAYMENT_METHOD_NAMES;
    if (
      !data ||
      data.scope !== "CLASSES" ||
      data.is_active === false ||
      !professorNames.includes(data.name as string)
    ) {
      throw new ClassRequestError("Elegí el medio de pago del profesor");
    }
  }

  private requireWeekday(weekday: number): void {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new ClassRequestError("El día no es válido");
    }
  }

  private requireStart(startTime: string): string {
    const start = normalizeTime(startTime);
    if (!start) throw new ClassRequestError("La hora no es válida");
    return start;
  }

  private requireInsideDay(start: string): void {
    if (!classFitsInDay(start)) {
      throw new ClassRequestError("La clase tiene que entrar entre las 06:00 y las 00:00");
    }
  }

  private async requireSchedule(id: number): Promise<{
    id: number;
    professor_id: number;
    court_id: number;
    weekday: number;
    start_time: string;
    duration_minutes: number;
    name: string | null;
    is_active: boolean;
  }> {
    const { data, error } = await this.supabase
      .from("class_schedules")
      .select("id, professor_id, court_id, weekday, start_time, duration_minutes, name, is_active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    if (!data) throw new ClassRequestError("No se encontró la clase", 404);
    return {
      ...data,
      duration_minutes: asNumber(data.duration_minutes) || CLASS_DURATION_MINUTES,
    } as {
      id: number;
      professor_id: number;
      court_id: number;
      weekday: number;
      start_time: string;
      duration_minutes: number;
      name: string | null;
      is_active: boolean;
    };
  }

  private async requireSession(id: number): Promise<{
    id: number;
    schedule_id: number;
    session_date: string;
    court_id: number;
    start_time: string;
    end_time: string;
    status: string;
  }> {
    const { data, error } = await this.supabase
      .from("class_sessions")
      .select("id, schedule_id, session_date, court_id, start_time, end_time, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw this.fail(error);
    if (!data) throw new ClassRequestError("No se encontró la clase de ese día", 404);
    return {
      ...data,
      session_date: String(data.session_date).slice(0, 10),
    } as {
      id: number;
      schedule_id: number;
      session_date: string;
      court_id: number;
      start_time: string;
      end_time: string;
      status: string;
    };
  }

  private async assertScheduleFree(
    courtId: number,
    professorId: number,
    weekday: number,
    start: string,
    end: string,
    ignoreId?: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from("class_schedules")
      .select("id, court_id, professor_id, start_time, duration_minutes")
      .eq("weekday", weekday)
      .eq("is_active", true);
    if (error) throw this.fail(error);
    for (const row of data ?? []) {
      if (row.id === ignoreId) continue;
      const otherEnd = endTimeAfter(row.start_time as string, asNumber(row.duration_minutes) || CLASS_DURATION_MINUTES);
      if (!rangesOverlap({ start, end }, { start: row.start_time as string, end: otherEnd })) continue;
      if (row.court_id === courtId) {
        throw new ClassRequestError("Esa cancha ya tiene una clase en ese horario", 409);
      }
      if (row.professor_id === professorId) {
        throw new ClassRequestError("Ese profesor ya tiene una clase en ese horario", 409);
      }
    }
  }

  private async assertSessionFree(
    courtId: number,
    date: string,
    start: string,
    end: string,
    ignoreId: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from("class_sessions")
      .select("id, start_time, end_time")
      .eq("court_id", courtId)
      .eq("session_date", date)
      .eq("status", "scheduled");
    if (error) throw this.fail(error);
    for (const row of data ?? []) {
      if (row.id === ignoreId) continue;
      if (rangesOverlap({ start, end }, { start: row.start_time as string, end: row.end_time as string })) {
        throw new ClassRequestError("Esa cancha ya tiene una clase en ese horario", 409);
      }
    }
  }

  private async ensureSessions(from: string, to: string): Promise<void> {
    const { data: schedules, error } = await this.supabase
      .from("class_schedules")
      .select("id, professor_id, court_id, weekday, start_time, duration_minutes, is_active")
      .eq("is_active", true);
    if (error) throw this.fail(error);
    const active = schedules ?? [];
    if (active.length === 0) {
      await this.syncOpenRosters(from, to);
      return;
    }

    const { data: existing, error: existingError } = await this.supabase
      .from("class_sessions")
      .select("id, schedule_id, session_date, status, detached, roster_customized")
      .gte("session_date", from)
      .lte("session_date", to)
      .in(
        "schedule_id",
        active.map((schedule) => schedule.id as number)
      );
    if (existingError) throw this.fail(existingError);

    const byKey = new Map<string, { id: number; status: string; detached: boolean; roster_customized: boolean }>();
    for (const row of existing ?? []) {
      byKey.set(`${row.schedule_id}:${String(row.session_date).slice(0, 10)}`, {
        id: row.id as number,
        status: row.status as string,
        detached: Boolean(row.detached),
        roster_customized: Boolean(row.roster_customized),
      });
    }

    const inserts = [];
    const restores: Array<{ id: number; court_id: number; start_time: string; end_time: string; professor_id: number }> = [];
    for (const schedule of active) {
      const duration = asNumber(schedule.duration_minutes) || CLASS_DURATION_MINUTES;
      const end = endTimeAfter(schedule.start_time as string, duration);
      for (const date of eachDate(from, to)) {
        if (weekdayOf(date) !== schedule.weekday) continue;
        const current = byKey.get(`${schedule.id}:${date}`);
        if (!current) {
          inserts.push({
            user_uid: this.userId,
            schedule_id: schedule.id,
            session_date: date,
            court_id: schedule.court_id,
            start_time: schedule.start_time,
            end_time: end,
            professor_id: schedule.professor_id,
            status: "scheduled",
            roster_customized: false,
            detached: false,
          });
          continue;
        }
        if (current.status === "cancelled" && !current.detached && !current.roster_customized) {
          restores.push({
            id: current.id,
            court_id: schedule.court_id as number,
            start_time: schedule.start_time as string,
            end_time: end,
            professor_id: schedule.professor_id as number,
          });
        }
      }
    }

    if (inserts.length > 0) {
      const { error: insertError } = await this.supabase.from("class_sessions").insert(inserts);
      if (insertError && insertError.code !== "23505") throw this.fail(insertError);
    }
    for (const restore of restores) {
      const { error: restoreError } = await this.supabase
        .from("class_sessions")
        .update({
          status: "scheduled",
          court_id: restore.court_id,
          start_time: restore.start_time,
          end_time: restore.end_time,
          professor_id: restore.professor_id,
        })
        .eq("id", restore.id);
      if (restoreError) throw this.fail(restoreError);
    }

    await this.syncOpenRosters(from, to);
  }

  private async syncOpenRosters(from: string, to: string): Promise<void> {
    const { data: sessions, error } = await this.supabase
      .from("class_sessions")
      .select("id, schedule_id, session_date")
      .gte("session_date", from)
      .lte("session_date", to)
      .eq("roster_customized", false);
    if (error) throw this.fail(error);
    if (!sessions?.length) return;

    const scheduleIds = Array.from(new Set(sessions.map((session) => session.schedule_id as number)));
    const sessionIds = sessions.map((session) => session.id as number);
    const [enrollmentRes, playerRes] = await Promise.all([
      this.supabase
        .from("class_enrollments")
        .select("schedule_id, player_id, started_on, ended_on")
        .in("schedule_id", scheduleIds),
      this.supabase
        .from("class_session_players")
        .select("session_id, player_id")
        .in("session_id", sessionIds),
    ]);
    if (enrollmentRes.error) throw this.fail(enrollmentRes.error);
    if (playerRes.error) throw this.fail(playerRes.error);

    const enrollments = enrollmentRes.data ?? [];
    const currentBySession = new Map<number, number[]>();
    for (const row of playerRes.data ?? []) {
      const list = currentBySession.get(row.session_id as number) ?? [];
      list.push(row.player_id as number);
      currentBySession.set(row.session_id as number, list);
    }

    for (const session of sessions) {
      const date = String(session.session_date).slice(0, 10);
      const desired = enrollments
        .filter(
          (enrollment) =>
            enrollment.schedule_id === session.schedule_id &&
            enrollmentOnClassDay(
              String(enrollment.started_on).slice(0, 10),
              enrollment.ended_on ? String(enrollment.ended_on).slice(0, 10) : null,
              date
            )
        )
        .map((enrollment) => enrollment.player_id as number);
      await this.replaceRosterIfNeeded(session.id as number, currentBySession.get(session.id as number) ?? [], desired);
    }
  }

  private async replaceRosterIfNeeded(sessionId: number, current: number[], desired: number[]): Promise<void> {
    const desiredSet = new Set(desired);
    const currentSet = new Set(current);
    const remove = current.filter((id) => !desiredSet.has(id));
    const add = desired.filter((id) => !currentSet.has(id));
    if (remove.length > 0) {
      const { error } = await this.supabase
        .from("class_session_players")
        .delete()
        .eq("session_id", sessionId)
        .in("player_id", remove);
      if (error) throw this.fail(error);
    }
    if (add.length > 0) {
      const { error } = await this.supabase.from("class_session_players").insert(
        add.map((playerId) => ({
          user_uid: this.userId,
          session_id: sessionId,
          player_id: playerId,
        }))
      );
      if (error) throw this.fail(error);
    }
  }

  private async fetchSessions(from: string, to: string): Promise<ClassSession[]> {
    const { data, error } = await this.supabase
      .from("class_sessions")
      .select(
        `
        id, schedule_id, session_date, court_id, start_time, end_time, professor_id,
        status, roster_customized, detached,
        professor:professor_id (id, name),
        court:court_id (id, name),
        schedule:schedule_id (id, name, weekday),
        players:class_session_players (
          player_id,
          player:player_id (id, first_name, last_name)
        )
      `
      )
      .gte("session_date", from)
      .lte("session_date", to)
      .order("session_date")
      .order("start_time");
    if (error) throw this.fail(error);

    return (data ?? []).map((row) => {
      const players = (Array.isArray(row.players) ? row.players : []).map((entry) => {
        const player = one(
          entry.player as
            | { id: number; first_name: string; last_name: string }
            | { id: number; first_name: string; last_name: string }[]
            | null
        );
        return {
          player_id: entry.player_id as number,
          first_name: player?.first_name ?? "",
          last_name: player?.last_name ?? "",
        };
      });
      players.sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "es"));
      return {
        id: row.id as number,
        schedule_id: row.schedule_id as number,
        session_date: String(row.session_date).slice(0, 10),
        court_id: row.court_id as number,
        start_time: row.start_time as string,
        end_time: row.end_time as string,
        professor_id: row.professor_id as number,
        status: row.status === "cancelled" ? "cancelled" : "scheduled",
        roster_customized: Boolean(row.roster_customized),
        detached: Boolean(row.detached),
        professor: one(row.professor as { id: number; name: string } | { id: number; name: string }[] | null),
        court: one(row.court as { id: number; name: string } | { id: number; name: string }[] | null),
        schedule: one(
          row.schedule as
            | { id: number; name: string | null; weekday: number }
            | { id: number; name: string | null; weekday: number }[]
            | null
        ),
        players,
      };
    });
  }

  private mapEnrollment(enrollment: {
    id: number;
    player_id: number;
    started_on: string;
    ended_on: string | null;
    player: { id: number; first_name: string; last_name: string } | { id: number; first_name: string; last_name: string }[] | null;
  }): ClassEnrollment {
    return {
      id: enrollment.id,
      player_id: enrollment.player_id,
      started_on: String(enrollment.started_on).slice(0, 10),
      ended_on: enrollment.ended_on ? String(enrollment.ended_on).slice(0, 10) : null,
      player: one(enrollment.player),
    };
  }

  private mapCharge(row: {
    id: number;
    player_id: number;
    professor_id: number;
    year_month: string;
    weekly_count: unknown;
    amount: unknown;
    status: string;
    paid_at: string | null;
    professor_share: unknown;
    partners_share: unknown;
    emanuel_share: unknown;
    payment_method: ClassPaymentMethodRef | ClassPaymentMethodRef[] | null;
    player: ClassPlayerRef | ClassPlayerRef[] | null;
    professor: { id: number; name: string } | { id: number; name: string }[] | null;
  }): ClassCharge {
    return {
      id: row.id,
      player_id: row.player_id,
      professor_id: row.professor_id,
      year_month: row.year_month,
      weekly_count: asNumber(row.weekly_count),
      amount: asNumber(row.amount),
      professor_share: row.professor_share == null ? null : asNumber(row.professor_share),
      partners_share: row.partners_share == null ? null : asNumber(row.partners_share),
      emanuel_share: row.emanuel_share == null ? null : asNumber(row.emanuel_share),
      status: row.status === "paid" ? "paid" : "pending",
      paid_at: row.paid_at,
      payment_method: one(row.payment_method),
      player: one(row.player),
      professor: one(row.professor),
    };
  }
}
