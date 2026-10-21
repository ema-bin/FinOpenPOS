export class ClassRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClassRequestError";
    this.status = status;
  }
}
