-- Licenciamiento on-prem (cliente): estado local de licencia/instalación (idempotente, TypeORM idempotente complementario)
-- Tablas single-row (id=1) para cache de verificación, gracia y metadatos de actualización.

CREATE TABLE IF NOT EXISTS app_licensing_state (
  id integer PRIMARY KEY DEFAULT 1,
  instance_id varchar(128),
  machine_id_hash varchar(128),
  fingerprint_hash varchar(128),
  license_status varchar(32),
  plan_code varchar(64),
  valid_until timestamptz,
  grace_deadline_at timestamptz,
  last_check_at timestamptz,
  last_successful_check_at timestamptz,
  last_server_time timestamptz,
  last_token_jws text,
  last_error text,
  clock_tamper_suspected boolean NOT NULL DEFAULT false,
  enforcement_mode varchar(16),
  app_version varchar(64),
  update_available_version varchar(64),
  update_manifest_meta jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_app_licensing_state_singleton CHECK (id = 1)
);

INSERT INTO app_licensing_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Estado de instalación (opcional, útil para seed/updates host); single-row id=1.
CREATE TABLE IF NOT EXISTS app_installation_state (
  id integer PRIMARY KEY DEFAULT 1,
  installed_version varchar(64),
  admin_seeded_at timestamptz,
  initialized_at timestamptz,
  last_update_check_at timestamptz,
  update_available_version varchar(64),
  update_manifest_meta jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_app_installation_state_singleton CHECK (id = 1)
);

INSERT INTO app_installation_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
