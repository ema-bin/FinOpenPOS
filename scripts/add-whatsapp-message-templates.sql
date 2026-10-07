CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('tournament_invite', 'debt_reminder')),
    name        TEXT NOT NULL,
    body        TEXT NOT NULL,
    user_uid    UUID,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_templates_kind
    ON whatsapp_message_templates(kind);

INSERT INTO whatsapp_message_templates (kind, name, body)
SELECT v.kind, v.name, v.body
FROM (VALUES
    ('tournament_invite', 'Corto', 'Hola {nombre}! Ya está abierta la inscripción al *torneo de {categoria}*. Cupos limitados. Te anotás?'),
    ('tournament_invite', 'Directo', '{nombre}, se viene el *torneo de {categoria}* y todavía no te anotaste. Te sumás?'),
    ('tournament_invite', 'Amistoso', 'Hola {nombre}! Abrimos la inscripción para el *torneo de {categoria}*. Si querés jugar, avisanos y te anotamos.'),
    ('tournament_invite', 'Últimos cupos', 'Hola {nombre}! Quedan pocos lugares para el *torneo de {categoria}*. Te guardo uno?')
) AS v(kind, name, body)
WHERE NOT EXISTS (
    SELECT 1 FROM whatsapp_message_templates WHERE kind = 'tournament_invite'
);
