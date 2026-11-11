import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BaselineSchema1710000000000
 * Congela el esquema actual de la base de datos (snapshot schema-only, 2026-11-11).
 * - IRREVERSIBLE como baseline: no implementa down destructivo seguro.
 * - Entornos con esquema ya existente (dev con synchronize/SQLs previos): marcar como aplicada con
 *   \`migration:run --fake -d dist/database/data-source.js\` (no re-ejecutar DDL sobre datos).
 * - Entornos nuevos/vacíos: \`migration:run\` crea el esquema completo.
 */
export class BaselineSchema1710000000000 implements MigrationInterface {
  name = 'BaselineSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19 (Debian 15.19-1.pgdg13+2)
-- Dumped by pg_dump version 15.19 (Debian 15.19-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adelantos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adelantos (
    id integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    "montoEntregado" numeric(10,2) NOT NULL,
    "metodoPago" character varying(50),
    observaciones text,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    "empleadoId" integer
);


--
-- Name: adelantos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adelantos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adelantos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adelantos_id_seq OWNED BY public.adelantos.id;


--
-- Name: app_installation_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_installation_state (
    id integer DEFAULT 1 NOT NULL,
    installed_version character varying(64),
    admin_seeded_at timestamp with time zone,
    initialized_at timestamp with time zone,
    last_update_check_at timestamp with time zone,
    update_available_version character varying(64),
    update_manifest_meta jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_app_installation_state_singleton CHECK ((id = 1))
);


--
-- Name: app_licensing_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_licensing_state (
    id integer DEFAULT 1 NOT NULL,
    instance_id character varying(128),
    machine_id_hash character varying(128),
    fingerprint_hash character varying(128),
    license_status character varying(32),
    plan_code character varying(64),
    valid_until timestamp with time zone,
    grace_deadline_at timestamp with time zone,
    last_check_at timestamp with time zone,
    last_successful_check_at timestamp with time zone,
    last_server_time timestamp with time zone,
    last_token_jws text,
    last_error text,
    clock_tamper_suspected boolean DEFAULT false NOT NULL,
    enforcement_mode character varying(16),
    app_version character varying(64),
    update_available_version character varying(64),
    update_manifest_meta jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_app_licensing_state_singleton CHECK ((id = 1))
);


--
-- Name: aprendizaje_paquetes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aprendizaje_paquetes (
    id integer NOT NULL,
    espesor integer NOT NULL,
    ancho integer NOT NULL,
    largo integer NOT NULL,
    especie character varying,
    "piezasPorPaquete" integer DEFAULT 0 NOT NULL,
    separadores jsonb DEFAULT '[]'::jsonb NOT NULL,
    tacos jsonb DEFAULT '[]'::jsonb NOT NULL,
    "vecesUsado" integer DEFAULT 0 NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: aprendizaje_paquetes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aprendizaje_paquetes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aprendizaje_paquetes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aprendizaje_paquetes_id_seq OWNED BY public.aprendizaje_paquetes.id;


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id integer NOT NULL,
    aserradero_id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: areas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.areas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: areas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.areas_id_seq OWNED BY public.areas.id;


--
-- Name: aserraderos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aserraderos (
    id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: aserraderos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aserraderos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aserraderos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aserraderos_id_seq OWNED BY public.aserraderos.id;


--
-- Name: backup_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_config (
    id integer NOT NULL,
    "localEnabled" boolean DEFAULT true NOT NULL,
    "retentionDays" integer DEFAULT 30 NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "backupTime" character varying DEFAULT '20:00'::character varying NOT NULL
);


--
-- Name: backup_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_config_id_seq OWNED BY public.backup_config.id;


--
-- Name: backup_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_runs (
    id integer NOT NULL,
    "fileName" character varying NOT NULL,
    status character varying DEFAULT 'running'::character varying NOT NULL,
    "fileSizeBytes" bigint,
    "errorMessage" text,
    "cloudStatus" character varying DEFAULT 'pending'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: backup_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_runs_id_seq OWNED BY public.backup_runs.id;


--
-- Name: cierres_archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cierres_archivos (
    id integer NOT NULL,
    aserradero character varying(120),
    "idCierre" character varying(120) NOT NULL,
    datos jsonb NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cierres_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cierres_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cierres_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cierres_archivos_id_seq OWNED BY public.cierres_archivos.id;


--
-- Name: cierres_boveda_pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cierres_boveda_pagos (
    id integer NOT NULL,
    aserradero character varying(120),
    "idUnico" character varying(120) NOT NULL,
    datos jsonb NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cierres_boveda_pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cierres_boveda_pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cierres_boveda_pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cierres_boveda_pagos_id_seq OWNED BY public.cierres_boveda_pagos.id;


--
-- Name: cierres_historial_liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cierres_historial_liquidaciones (
    id integer NOT NULL,
    aserradero character varying(120),
    clave character varying(200) NOT NULL,
    datos jsonb NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cierres_historial_liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cierres_historial_liquidaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cierres_historial_liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cierres_historial_liquidaciones_id_seq OWNED BY public.cierres_historial_liquidaciones.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    "cuitDni" character varying(50),
    telefono character varying(50),
    direccion character varying(250),
    aserradero character varying(120),
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "alicuotaIvaDefault" double precision
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: conciliacion_coef_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliacion_coef_config (
    id integer NOT NULL,
    aserradero character varying(120) NOT NULL,
    "grupoEspecie" character varying(20) NOT NULL,
    "rendimientoMadera" double precision,
    "coefAserrin" double precision,
    "coefChip" double precision,
    "factorTnConsumo" double precision,
    "m3UtilPorP2" double precision,
    "factorTnPlayaDefault" double precision,
    activo boolean DEFAULT true NOT NULL,
    usuario character varying(120),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "factorTnAserrin" double precision,
    "factorTnChip" double precision
);


--
-- Name: conciliacion_coef_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conciliacion_coef_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conciliacion_coef_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conciliacion_coef_config_id_seq OWNED BY public.conciliacion_coef_config.id;


--
-- Name: conteos_playa_rollo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conteos_playa_rollo (
    id integer NOT NULL,
    aserradero character varying(120) NOT NULL,
    "fechaCierre" character varying(20) NOT NULL,
    turno character varying(30),
    "tipoPeriodo" character varying(20) DEFAULT 'libre'::character varying NOT NULL,
    "factorTnPlaya" double precision DEFAULT '0.7'::double precision NOT NULL,
    "totalM3" double precision DEFAULT '0'::double precision NOT NULL,
    "totalTn" double precision DEFAULT '0'::double precision NOT NULL,
    observaciones text,
    usuario character varying(120),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conteos_playa_rollo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conteos_playa_rollo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conteos_playa_rollo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conteos_playa_rollo_id_seq OWNED BY public.conteos_playa_rollo.id;


--
-- Name: conteos_playa_rollo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conteos_playa_rollo_items (
    id integer NOT NULL,
    "largoRollo" double precision NOT NULL,
    "metrosLineales" double precision NOT NULL,
    alto double precision NOT NULL,
    "m3Pila" double precision NOT NULL,
    "factorTn" double precision DEFAULT '0.7'::double precision NOT NULL,
    tn double precision NOT NULL,
    "grupoEspecie" character varying(30),
    "conteoId" integer
);


--
-- Name: conteos_playa_rollo_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conteos_playa_rollo_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conteos_playa_rollo_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conteos_playa_rollo_items_id_seq OWNED BY public.conteos_playa_rollo_items.id;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id integer NOT NULL,
    "nombreCompleto" character varying(150) NOT NULL,
    documento character varying(20) NOT NULL,
    cuil character varying(20) NOT NULL,
    "telefonoPersonal" character varying(30),
    "telefonoEmergencia" character varying(30),
    "estaEnBlanco" boolean DEFAULT false NOT NULL,
    "tieneSeguro" boolean DEFAULT false NOT NULL,
    puesto character varying(100) DEFAULT 'Operario'::character varying NOT NULL,
    "categoriaProduccion" character varying(50) DEFAULT 'OPERARIO'::character varying NOT NULL,
    "tipoSalario" character varying(20) DEFAULT 'POR_HORA'::character varying NOT NULL,
    "sueldoFijo" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "precioPorHora" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "saldoPendiente" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "estaActivo" boolean DEFAULT true NOT NULL,
    "fechaIngreso" date,
    "turnoIngreso" character varying(20),
    "fechaBaja" date,
    "turnoBaja" character varying(20),
    "fechaCreacion" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaActualizacion" timestamp without time zone DEFAULT now() NOT NULL,
    "jornadaLaboral" character varying(30) DEFAULT 'LUNES_VIERNES'::character varying NOT NULL,
    "diasPersonalizados" jsonb,
    aserradero character varying(120)
);


--
-- Name: empleados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empleados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empleados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empleados_id_seq OWNED BY public.empleados.id;


--
-- Name: fleteros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleteros (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    "transporteId" integer,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fleteros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleteros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleteros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleteros_id_seq OWNED BY public.fleteros.id;


--
-- Name: gastos_comprobantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos_comprobantes (
    id integer NOT NULL,
    aserradero_id integer NOT NULL,
    aserradero_nombre character varying(120) NOT NULL,
    area_id integer NOT NULL,
    area_nombre character varying(120) NOT NULL,
    fecha date NOT NULL,
    mes integer NOT NULL,
    anio integer NOT NULL,
    proveedor_id integer,
    proveedor_nombre character varying(200),
    tipo_comprobante character varying(20) NOT NULL,
    punto_venta character varying(10),
    numero_comprobante character varying(30),
    responsable character varying(120) NOT NULL,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    moneda character varying(3) DEFAULT 'ARS'::character varying NOT NULL,
    subtotal_neto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva_alicuota numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    iva_exento boolean DEFAULT false NOT NULL,
    iva_monto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    otros_tributos numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    observaciones text,
    creado_por_usuario_id integer,
    creado_por character varying(160),
    confirmado_at timestamp without time zone,
    confirmado_por character varying(160),
    anulado_at timestamp without time zone,
    anulado_por character varying(160),
    anulado_motivo text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gastos_comprobantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_comprobantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_comprobantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_comprobantes_id_seq OWNED BY public.gastos_comprobantes.id;


--
-- Name: gastos_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos_lineas (
    id integer NOT NULL,
    gasto_comprobante_id integer NOT NULL,
    rubro_id integer NOT NULL,
    rubro_nombre character varying(120),
    descripcion character varying(255),
    cantidad numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    precio_unitario numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    neto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gastos_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_lineas_id_seq OWNED BY public.gastos_lineas.id;


--
-- Name: ingresos_rollos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingresos_rollos (
    id integer NOT NULL,
    "maderaId" integer NOT NULL,
    "proveedorMaderaId" integer NOT NULL,
    "quintaId" integer,
    "plantacionId" integer,
    "cargaDDD" character varying(50),
    "transporteId" integer NOT NULL,
    "fleteroId" integer NOT NULL,
    "nroRemito" character varying(100) NOT NULL,
    fecha character varying(20) NOT NULL,
    aserradero character varying(120) NOT NULL,
    mes integer,
    anio integer,
    "largoMetros" double precision DEFAULT '0'::double precision NOT NULL,
    m3 double precision DEFAULT '0'::double precision NOT NULL,
    toneladas double precision DEFAULT '0'::double precision NOT NULL,
    "precioTnMadera" double precision DEFAULT '0'::double precision NOT NULL,
    "subtotalBruto" double precision DEFAULT '0'::double precision NOT NULL,
    iva double precision DEFAULT '0'::double precision NOT NULL,
    "totalMadera" double precision DEFAULT '0'::double precision NOT NULL,
    "precioFleteTn" double precision DEFAULT '0'::double precision NOT NULL,
    "subtotalFlete" double precision DEFAULT '0'::double precision NOT NULL,
    "ajustesAdicionalesFlete" double precision DEFAULT '0'::double precision NOT NULL,
    "totalFleteViaje" double precision DEFAULT '0'::double precision NOT NULL,
    "stockCampoM3" double precision,
    "stockCampoTN" double precision,
    "utilizacionSemanalRollo" double precision,
    "stockFinalCampo" double precision,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ingresos_rollos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingresos_rollos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingresos_rollos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingresos_rollos_id_seq OWNED BY public.ingresos_rollos.id;


--
-- Name: liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidaciones (
    id integer NOT NULL,
    "totalGenerado" numeric(10,2) NOT NULL,
    "saldoDescontado" numeric(10,2) NOT NULL,
    "totalPagado" numeric(10,2) NOT NULL,
    "fechaLiquidacion" timestamp without time zone DEFAULT now() NOT NULL,
    "empleadoId" integer
);


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidaciones_id_seq OWNED BY public.liquidaciones.id;


--
-- Name: maderas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maderas (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: maderas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maderas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maderas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maderas_id_seq OWNED BY public.maderas.id;


--
-- Name: mesas_pallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesas_pallet (
    id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    aserradero character varying(120),
    "integranteIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mesas_pallet_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mesas_pallet_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mesas_pallet_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mesas_pallet_id_seq OWNED BY public.mesas_pallet.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: movimientos_cc_fletero; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_cc_fletero (
    id integer NOT NULL,
    "fleteroId" integer NOT NULL,
    tipo character varying(40) NOT NULL,
    monto double precision NOT NULL,
    fecha character varying(20) NOT NULL,
    concepto character varying(250),
    medio character varying(100),
    referencia character varying(120),
    observacion text,
    "ingresoRolloId" integer,
    aserradero character varying(120),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: movimientos_cc_fletero_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_cc_fletero_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_cc_fletero_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_cc_fletero_id_seq OWNED BY public.movimientos_cc_fletero.id;


--
-- Name: pallet_producciones_diarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pallet_producciones_diarias (
    id integer NOT NULL,
    "palletId" integer NOT NULL,
    cantidad integer NOT NULL,
    "tarifaManoObra" numeric(10,4) DEFAULT '0'::numeric NOT NULL,
    fecha date DEFAULT ('now'::text)::date NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    aserradero character varying(120),
    "mesaId" integer,
    "empleadoId" integer,
    "empleadoNombre" character varying(150)
);


--
-- Name: pallet_producciones_diarias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pallet_producciones_diarias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pallet_producciones_diarias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pallet_producciones_diarias_id_seq OWNED BY public.pallet_producciones_diarias.id;


--
-- Name: pallet_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pallet_recipes (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    "especieMadera" character varying NOT NULL,
    "piezasMaderaPorPallet" integer NOT NULL,
    "componentesMadera" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "tipoClavo" character varying NOT NULL,
    "cantidadClavosPorPallet" integer NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "costoUnitarioMadera" numeric(10,4) DEFAULT '0'::numeric NOT NULL,
    "costoUnitarioClavo" numeric(10,4) NOT NULL,
    "tarifaManoObra" numeric(10,4) NOT NULL
);


--
-- Name: pallet_recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pallet_recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pallet_recipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pallet_recipes_id_seq OWNED BY public.pallet_recipes.id;


--
-- Name: partes_diarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partes_diarios (
    id integer NOT NULL,
    fecha date NOT NULL,
    "horasTrabajadas" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "precioPorHora" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "palletsFabricados" integer DEFAULT 0 NOT NULL,
    "precioPorPallet" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "turnosLimpieza" integer DEFAULT 0 NOT NULL,
    "precioPorLimpieza" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "camionesCargados" integer DEFAULT 0 NOT NULL,
    "precioPorCamion" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "montoExtra" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "detalleExtra" text,
    liquidado boolean DEFAULT false NOT NULL,
    "fechaRegistro" timestamp without time zone DEFAULT now() NOT NULL,
    "empleadoId" integer
);


--
-- Name: partes_diarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.partes_diarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: partes_diarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.partes_diarios_id_seq OWNED BY public.partes_diarios.id;


--
-- Name: pedido_asignaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_asignaciones (
    id integer NOT NULL,
    "pedidoId" integer NOT NULL,
    "pedidoItemId" integer NOT NULL,
    "produccionId" integer NOT NULL,
    "aserraderoOrigen" character varying,
    "aserraderoGestion" character varying,
    "paquetesAsignados" double precision NOT NULL,
    "piezasPorPaquete" double precision DEFAULT '0'::double precision NOT NULL,
    "tablasAsignadas" double precision DEFAULT '0'::double precision NOT NULL,
    "medidaSolicitadaEsp" double precision NOT NULL,
    "medidaSolicitadaAnc" double precision NOT NULL,
    "medidaSolicitadaLar" double precision NOT NULL,
    "medidaRealEsp" double precision NOT NULL,
    "medidaRealAnc" double precision NOT NULL,
    "medidaRealLar" double precision NOT NULL,
    "unidadDimensionesReal" character varying DEFAULT 'MM'::character varying NOT NULL,
    "difiereMedida" boolean DEFAULT false NOT NULL,
    "toleranciaMm" double precision DEFAULT '1'::double precision NOT NULL,
    "p2Solicitado" double precision DEFAULT '0'::double precision NOT NULL,
    "p2Real" double precision,
    "separadoresSnapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "tacosSnapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
    estado character varying DEFAULT 'RESERVADA'::character varying NOT NULL,
    "solicitadoPor" character varying,
    "autorizadoPor" character varying,
    "retiradoPor" character varying,
    "fechaSolicitud" character varying,
    "fechaAutorizacion" character varying,
    "fechaRetiro" character varying,
    "motivoRechazo" text,
    observaciones text,
    "salidaStockId" integer,
    "salidaDetalleId" integer
);


--
-- Name: pedido_asignaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedido_asignaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedido_asignaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedido_asignaciones_id_seq OWNED BY public.pedido_asignaciones.id;


--
-- Name: pedido_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_items (
    id integer NOT NULL,
    "pedidoId" integer NOT NULL,
    especie character varying,
    "espesorSolicitado" double precision,
    "anchoSolicitado" double precision,
    "largoSolicitado" double precision,
    "unidadDimensiones" character varying DEFAULT 'MM'::character varying NOT NULL,
    "cantidadSolicitada" double precision DEFAULT '0'::double precision NOT NULL,
    "cantidadAsignada" double precision DEFAULT '0'::double precision NOT NULL,
    "cantidadFaltante" double precision DEFAULT '0'::double precision NOT NULL,
    "p2SolicitadoEstimado" double precision DEFAULT '0'::double precision NOT NULL,
    estado character varying DEFAULT 'PENDIENTE'::character varying NOT NULL,
    observaciones text,
    "tipoProducto" character varying DEFAULT 'MADERA'::character varying NOT NULL,
    "subproductoTipo" character varying,
    "tnEstimada" double precision
);


--
-- Name: pedido_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedido_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedido_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedido_items_id_seq OWNED BY public.pedido_items.id;


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id integer NOT NULL,
    "numeroPedido" character varying NOT NULL,
    fecha character varying(20) NOT NULL,
    "clienteId" integer,
    "clienteNombre" character varying NOT NULL,
    "clienteCuitDni" character varying,
    "clienteTelefono" character varying,
    "clienteDireccion" character varying,
    aserradero character varying NOT NULL,
    estado character varying DEFAULT 'BORRADOR'::character varying NOT NULL,
    "cantidadSolicitadaTotal" double precision DEFAULT '0'::double precision NOT NULL,
    "totalP2Solicitado" double precision DEFAULT '0'::double precision NOT NULL,
    "kgEstimados" double precision,
    "medidaResumen" character varying,
    observaciones text,
    "remitoFisicoNumero" character varying,
    "salidaStockId" integer,
    "creadoPor" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pedidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_id_seq OWNED BY public.pedidos.id;


--
-- Name: pendientes_produccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pendientes_produccion (
    id integer NOT NULL,
    "clienteNombre" character varying(200) NOT NULL,
    "clienteId" integer,
    fecha character varying(20) NOT NULL,
    aserradero character varying(120) NOT NULL,
    especie character varying(100) NOT NULL,
    espesor double precision NOT NULL,
    ancho double precision NOT NULL,
    largo double precision NOT NULL,
    "unidadDimensiones" character varying(30) DEFAULT 'MM'::character varying NOT NULL,
    "cantidadRequerida" double precision NOT NULL,
    "cantidadProducida" double precision DEFAULT '0'::double precision NOT NULL,
    "p2Estimado" double precision DEFAULT '0'::double precision NOT NULL,
    estado character varying(40) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    observaciones text,
    "creadoPor" character varying(150),
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pendientes_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pendientes_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pendientes_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pendientes_produccion_id_seq OWNED BY public.pendientes_produccion.id;


--
-- Name: plantaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantaciones (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    "quintaId" integer,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: plantaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plantaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plantaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plantaciones_id_seq OWNED BY public.plantaciones.id;


--
-- Name: produccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produccion (
    id integer NOT NULL,
    fecha character varying NOT NULL,
    turno character varying NOT NULL,
    "tipoProducto" character varying NOT NULL,
    especie character varying NOT NULL,
    "descripcionProducto" character varying NOT NULL,
    observaciones character varying,
    "unidadMedida" character varying NOT NULL,
    "unidadDimensiones" character varying NOT NULL,
    "unidadResultado" character varying NOT NULL,
    "cantidadPaquetes" double precision NOT NULL,
    "piezasPorPaquete" double precision NOT NULL,
    espesor double precision NOT NULL,
    ancho double precision NOT NULL,
    largo double precision NOT NULL,
    separadores jsonb DEFAULT '[]'::jsonb NOT NULL,
    tacos jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    aserradero character varying,
    lote character varying,
    "cantidadReservada" double precision DEFAULT 0 NOT NULL
);


--
-- Name: produccion_entradas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produccion_entradas (
    id integer NOT NULL,
    fecha date NOT NULL,
    turno character varying(30) NOT NULL,
    especie character varying(80) NOT NULL,
    "unidadMedida" character varying(20) NOT NULL,
    "cantidadPaquetes" integer NOT NULL,
    "piezasPorPaquete" integer NOT NULL,
    espesor numeric(10,2) NOT NULL,
    ancho numeric(10,2) NOT NULL,
    largo numeric(10,2) NOT NULL,
    "volumenTotal" numeric(14,4) NOT NULL,
    separadores jsonb,
    tacos jsonb,
    "piezasTotales" integer NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "stockItemId" integer,
    "tipoProducto" character varying(30) DEFAULT 'MADERA_ASERRADA'::character varying NOT NULL,
    "descripcionProducto" character varying(120),
    "unidadDimensiones" character varying(20) DEFAULT 'MM'::character varying NOT NULL,
    "unidadResultado" character varying(10) DEFAULT 'P2'::character varying NOT NULL
);


--
-- Name: produccion_entradas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.produccion_entradas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: produccion_entradas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.produccion_entradas_id_seq OWNED BY public.produccion_entradas.id;


--
-- Name: produccion_entradas_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produccion_entradas_tags (
    "produccionEntradasId" integer NOT NULL,
    "tagsId" integer NOT NULL
);


--
-- Name: produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.produccion_id_seq OWNED BY public.produccion.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    razon_social character varying(200) NOT NULL,
    nombre_fantasia character varying(200),
    cuit character varying(20),
    rubro_habitual_id integer,
    telefono character varying(80),
    email character varying(160),
    direccion character varying(240),
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: proveedores_madera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores_madera (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    cuit character varying(50),
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedores_madera_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_madera_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_madera_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_madera_id_seq OWNED BY public.proveedores_madera.id;


--
-- Name: quintas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quintas (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    "proveedorMaderaId" integer,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: quintas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quintas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quintas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quintas_id_seq OWNED BY public.quintas.id;


--
-- Name: rubros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubros (
    id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rubros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubros_id_seq OWNED BY public.rubros.id;


--
-- Name: salida_stock_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salida_stock_detalles (
    id integer NOT NULL,
    "salidaStockId" integer NOT NULL,
    "tipoRenglon" character varying(30) DEFAULT 'MADERA_PAQUETE'::character varying NOT NULL,
    "produccionId" integer,
    "pedidoAsignacionId" integer,
    "subproductoEgresoId" integer,
    "productoTipo" character varying(60),
    "productoEspecie" character varying(120),
    detalle character varying(300),
    "medidaTexto" character varying(120),
    "espesorSolicitado" double precision,
    "anchoSolicitado" double precision,
    "largoSolicitado" double precision,
    "espesorReal" double precision,
    "anchoReal" double precision,
    "largoReal" double precision,
    "difiereMedida" boolean DEFAULT false NOT NULL,
    cantidad double precision DEFAULT '0'::double precision NOT NULL,
    piezas double precision,
    p2 double precision DEFAULT '0'::double precision NOT NULL,
    m2 double precision,
    toneladas double precision,
    "tnProvisionales" double precision,
    "tnReales" double precision,
    "unidadPrecio" character varying(20) DEFAULT 'P2'::character varying NOT NULL,
    "precioUnitario" double precision DEFAULT '0'::double precision NOT NULL,
    "cantidadBase" double precision DEFAULT '0'::double precision NOT NULL,
    "importeNeto" double precision DEFAULT '0'::double precision NOT NULL,
    "alicuotaIva" double precision DEFAULT '21'::double precision NOT NULL,
    "ivaMonto" double precision DEFAULT '0'::double precision NOT NULL,
    total double precision DEFAULT '0'::double precision NOT NULL,
    "estadoLinea" character varying(30),
    observaciones text
);


--
-- Name: salida_stock_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salida_stock_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salida_stock_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salida_stock_detalles_id_seq OWNED BY public.salida_stock_detalles.id;


--
-- Name: salidas_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salidas_stock (
    id integer NOT NULL,
    observaciones text,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "numeroRemito" character varying(50) NOT NULL,
    fecha character varying(20) NOT NULL,
    aserradero character varying(120) NOT NULL,
    "clienteId" integer,
    "clienteNombre" character varying(200) NOT NULL,
    "clienteCuitDni" character varying(50),
    "clienteTelefono" character varying(50),
    "clienteDireccion" character varying(250),
    "cantidadSolicitada" double precision DEFAULT '0'::double precision NOT NULL,
    "medidaSolicitada" character varying(100),
    "totalPaquetesDespachados" double precision DEFAULT '0'::double precision NOT NULL,
    "totalPiezasDespachadas" double precision DEFAULT '0'::double precision NOT NULL,
    "totalP2Despachado" double precision DEFAULT '0'::double precision NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    estado character varying(30) DEFAULT 'CONFIRMADA'::character varying NOT NULL,
    "creadoPor" character varying(150),
    "pedidoId" integer,
    "remitoFisicoNumero" character varying(80),
    "tipoComprobante" character varying(40),
    "facturaNumero" character varying(80),
    "estadoFacturacion" character varying(30) DEFAULT 'SIN_FACTURA'::character varying NOT NULL,
    transporte character varying(200),
    "origenTipo" character varying(40) DEFAULT 'LEGACY'::character varying NOT NULL,
    "estadoDespacho" character varying(40) DEFAULT 'CONFIRMADO'::character varying NOT NULL,
    moneda character varying(10) DEFAULT 'ARS'::character varying NOT NULL,
    "subtotalNeto" double precision DEFAULT '0'::double precision NOT NULL,
    "ivaMonto" double precision DEFAULT '0'::double precision NOT NULL,
    total double precision DEFAULT '0'::double precision NOT NULL,
    "toneladasTotal" double precision,
    "m2Total" double precision,
    "basculaPendiente" boolean DEFAULT false NOT NULL,
    "basculaConfirmadaAt" timestamp without time zone,
    "facturadoAt" timestamp without time zone,
    "anuladoMotivo" character varying(300),
    "anuladoAt" timestamp without time zone,
    usuario character varying(200)
);


--
-- Name: salidas_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salidas_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salidas_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salidas_stock_id_seq OWNED BY public.salidas_stock.id;


--
-- Name: stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_items (
    id integer NOT NULL,
    lote character varying(80) NOT NULL,
    especie character varying(80) NOT NULL,
    "unidadMedida" character varying(20) NOT NULL,
    "espesorReal" numeric(10,2) NOT NULL,
    "anchoReal" numeric(10,2) NOT NULL,
    "largoReal" numeric(10,2) NOT NULL,
    "paquetesIniciales" integer NOT NULL,
    "piezasIniciales" integer NOT NULL,
    "paquetesDisponibles" integer NOT NULL,
    "piezasDisponibles" integer NOT NULL,
    "volumenTotal" numeric(14,4) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    separadores jsonb,
    tacos jsonb,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "tipoProducto" character varying(30) DEFAULT 'MADERA_ASERRADA'::character varying NOT NULL,
    "descripcionProducto" character varying(120),
    "unidadDimensiones" character varying(20) DEFAULT 'MM'::character varying NOT NULL,
    "unidadResultado" character varying(10) DEFAULT 'P2'::character varying NOT NULL
);


--
-- Name: stock_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_items_id_seq OWNED BY public.stock_items.id;


--
-- Name: stock_items_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_items_tags (
    "stockItemsId" integer NOT NULL,
    "tagsId" integer NOT NULL
);


--
-- Name: subproductos_egresos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subproductos_egresos (
    id integer NOT NULL,
    aserradero character varying(120) NOT NULL,
    tipo character varying(20) NOT NULL,
    fecha character varying(20) NOT NULL,
    "especieDeclarada" character varying(30) DEFAULT 'MEZCLA'::character varying NOT NULL,
    "tnEstimadas" double precision NOT NULL,
    "tnReales" double precision,
    estado character varying(20) DEFAULT 'ESTIMADO'::character varying NOT NULL,
    referencia character varying(120),
    observaciones text,
    usuario character varying(120),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "precioPorTn" double precision
);


--
-- Name: subproductos_egresos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subproductos_egresos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subproductos_egresos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subproductos_egresos_id_seq OWNED BY public.subproductos_egresos.id;


--
-- Name: sueldos_mensuales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sueldos_mensuales (
    "empleadoId" integer NOT NULL,
    anio integer NOT NULL,
    mes integer NOT NULL,
    "sueldoAsignado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "sueldoAcreditado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "fechaCreacion" timestamp without time zone DEFAULT now() NOT NULL,
    "factorProrrateo" numeric(8,4) DEFAULT '1'::numeric NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    nombre character varying(60) NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: transportes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportes (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: transportes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transportes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transportes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transportes_id_seq OWNED BY public.transportes.id;


--
-- Name: turnos_borradores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos_borradores (
    id integer NOT NULL,
    aserradero character varying(120),
    "empleadoId" integer NOT NULL,
    fecha character varying(10) NOT NULL,
    "tipoTurno" character varying(20) NOT NULL,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    hs numeric(12,2) DEFAULT '0'::numeric,
    pal numeric(12,2) DEFAULT '0'::numeric,
    lim numeric(12,2) DEFAULT '0'::numeric,
    car numeric(12,2) DEFAULT '0'::numeric,
    des numeric(12,2) DEFAULT '0'::numeric,
    precio numeric(12,2) DEFAULT '0'::numeric,
    pres numeric(12,2) DEFAULT '0'::numeric,
    "datosExtra" jsonb,
    origen character varying(30),
    "creadoEn" timestamp without time zone DEFAULT now(),
    "actualizadoEn" timestamp without time zone DEFAULT now()
);


--
-- Name: turnos_borradores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turnos_borradores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turnos_borradores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turnos_borradores_id_seq OWNED BY public.turnos_borradores.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    email character varying NOT NULL,
    "passwordHash" character varying NOT NULL,
    rol character varying DEFAULT 'empleado'::character varying NOT NULL,
    "empleadoId" integer,
    "fechaCreacion" timestamp without time zone DEFAULT now() NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    aserradero character varying(120)
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: ventas_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas_detalles (
    id integer NOT NULL,
    especie character varying(80) NOT NULL,
    "espesorComercial" numeric(10,2) NOT NULL,
    "anchoComercial" numeric(10,2) NOT NULL,
    "largoComercial" numeric(10,2) NOT NULL,
    "cantidadPaquetes" integer NOT NULL,
    "cantidadPiezas" integer DEFAULT 0 NOT NULL,
    "paquetesDespachados" integer DEFAULT 0 NOT NULL,
    "piezasDespachadas" integer DEFAULT 0 NOT NULL,
    estado character varying(30) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    "ordenId" integer
);


--
-- Name: ventas_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ventas_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ventas_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ventas_detalles_id_seq OWNED BY public.ventas_detalles.id;


--
-- Name: ventas_ordenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas_ordenes (
    id integer NOT NULL,
    cliente character varying(120) NOT NULL,
    fecha date NOT NULL,
    estado character varying(30) DEFAULT 'ABIERTA'::character varying NOT NULL,
    observaciones text,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ventas_ordenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ventas_ordenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ventas_ordenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ventas_ordenes_id_seq OWNED BY public.ventas_ordenes.id;


--
-- Name: vw_rpt_cc_fleteros; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_cc_fleteros AS
 SELECT mv.id,
    (NULLIF((mv.fecha)::text, ''::text))::date AS fecha_d,
    mv.fecha,
    mv."fleteroId",
    COALESCE(f.nombre, ''::character varying) AS fletero_nombre,
    mv.tipo,
    COALESCE(mv.monto, (0)::double precision) AS monto,
        CASE
            WHEN ((mv.tipo)::text = 'credito_viaje'::text) THEN COALESCE(mv.monto, (0)::double precision)
            ELSE (0)::double precision
        END AS devengado,
        CASE
            WHEN ((mv.tipo)::text <> 'credito_viaje'::text) THEN COALESCE(mv.monto, (0)::double precision)
            ELSE (0)::double precision
        END AS pagos_adelantos,
        CASE
            WHEN ((mv.tipo)::text = 'credito_viaje'::text) THEN COALESCE(mv.monto, (0)::double precision)
            ELSE (- COALESCE(mv.monto, (0)::double precision))
        END AS impacto_saldo,
    mv.aserradero,
    mv."ingresoRolloId",
    mv.concepto,
    mv.medio
   FROM (public.movimientos_cc_fletero mv
     LEFT JOIN public.fleteros f ON ((f.id = mv."fleteroId")));


--
-- Name: vw_rpt_gastos_todos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_gastos_todos AS
 SELECT g.id,
    g.fecha AS fecha_d,
    g.fecha,
    g.mes,
    g.anio,
    g.aserradero_id,
    g.aserradero_nombre,
    g.area_id,
    g.area_nombre,
    g.proveedor_id,
    g.proveedor_nombre,
    g.tipo_comprobante,
    g.numero_comprobante,
    COALESCE(g.estado, ''::character varying) AS estado,
    COALESCE(g.subtotal_neto, (0)::numeric) AS subtotal_neto,
    COALESCE(g.iva_monto, (0)::numeric) AS iva_monto,
    COALESCE(g.otros_tributos, (0)::numeric) AS otros_tributos,
    COALESCE(g.total, (0)::numeric) AS total
   FROM public.gastos_comprobantes g;


--
-- Name: vw_rpt_gastos_confirmados; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_gastos_confirmados AS
 SELECT vw_rpt_gastos_todos.id,
    vw_rpt_gastos_todos.fecha_d,
    vw_rpt_gastos_todos.fecha,
    vw_rpt_gastos_todos.mes,
    vw_rpt_gastos_todos.anio,
    vw_rpt_gastos_todos.aserradero_id,
    vw_rpt_gastos_todos.aserradero_nombre,
    vw_rpt_gastos_todos.area_id,
    vw_rpt_gastos_todos.area_nombre,
    vw_rpt_gastos_todos.proveedor_id,
    vw_rpt_gastos_todos.proveedor_nombre,
    vw_rpt_gastos_todos.tipo_comprobante,
    vw_rpt_gastos_todos.numero_comprobante,
    vw_rpt_gastos_todos.estado,
    vw_rpt_gastos_todos.subtotal_neto,
    vw_rpt_gastos_todos.iva_monto,
    vw_rpt_gastos_todos.otros_tributos,
    vw_rpt_gastos_todos.total
   FROM public.vw_rpt_gastos_todos
  WHERE ((vw_rpt_gastos_todos.estado)::text = 'CONFIRMADO'::text);


--
-- Name: vw_rpt_ingresos_rollos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_ingresos_rollos AS
 SELECT ir.id,
    (NULLIF((ir.fecha)::text, ''::text))::date AS fecha_d,
    ir.fecha,
    ir.aserradero,
    ir."maderaId",
    COALESCE(m.nombre, ''::character varying) AS madera_nombre,
    ir."proveedorMaderaId",
    COALESCE(pm.nombre, ''::character varying) AS proveedor_nombre,
    ir."fleteroId",
    COALESCE(f.nombre, ''::character varying) AS fletero_nombre,
    ir."transporteId",
    COALESCE(t.nombre, ''::character varying) AS transporte_nombre,
    ir."nroRemito",
    COALESCE(ir.toneladas, (0)::double precision) AS toneladas,
    COALESCE(ir.m3, (0)::double precision) AS m3,
    COALESCE(ir."totalMadera", (0)::double precision) AS total_madera,
    COALESCE(ir."totalFleteViaje", (0)::double precision) AS total_flete,
    COALESCE(ir."subtotalBruto", (0)::double precision) AS subtotal_bruto,
    COALESCE(ir.iva, (0)::double precision) AS iva_madera
   FROM ((((public.ingresos_rollos ir
     LEFT JOIN public.maderas m ON ((m.id = ir."maderaId")))
     LEFT JOIN public.proveedores_madera pm ON ((pm.id = ir."proveedorMaderaId")))
     LEFT JOIN public.fleteros f ON ((f.id = ir."fleteroId")))
     LEFT JOIN public.transportes t ON ((t.id = ir."transporteId")));


--
-- Name: vw_rpt_pallets_produccion; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_pallets_produccion AS
 SELECT ppd.id,
    ppd.fecha AS fecha_d,
    ppd.fecha,
    ppd.aserradero,
    ppd."palletId" AS pallet_id,
    COALESCE(pr.nombre, ''::character varying) AS pallet_nombre,
    COALESCE(pr."especieMadera", ''::character varying) AS especie_madera,
    COALESCE(ppd.cantidad, 0) AS cantidad,
    COALESCE(ppd."tarifaManoObra", (0)::numeric) AS tarifa_mano_obra,
    ((COALESCE(ppd.cantidad, 0))::numeric * COALESCE(ppd."tarifaManoObra", (0)::numeric)) AS costo_mano_obra
   FROM (public.pallet_producciones_diarias ppd
     LEFT JOIN public.pallet_recipes pr ON ((pr.id = ppd."palletId")));


--
-- Name: vw_rpt_partes_diarios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_partes_diarios AS
 SELECT pd.id,
    pd.fecha AS fecha_d,
    pd.fecha,
    pd."empleadoId",
    COALESCE(e."nombreCompleto", ''::character varying) AS empleado_nombre,
    e.aserradero,
    COALESCE(pd."horasTrabajadas", (0)::numeric) AS horas_trabajadas,
    COALESCE(pd."montoExtra", (0)::numeric) AS monto_extra,
    COALESCE(pd."palletsFabricados", 0) AS pallets_fabricados,
    COALESCE(pd."camionesCargados", 0) AS camiones_cargados,
    COALESCE(pd."turnosLimpieza", 0) AS turnos_limpieza,
    COALESCE(pd.liquidado, false) AS liquidado
   FROM (public.partes_diarios pd
     LEFT JOIN public.empleados e ON ((e.id = pd."empleadoId")));


--
-- Name: vw_rpt_pedidos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_pedidos AS
 SELECT pd.id,
    pd."numeroPedido",
    (NULLIF((pd.fecha)::text, ''::text))::date AS fecha_d,
    pd.fecha,
    pd.aserradero,
    pd."clienteId",
    pd."clienteNombre",
    COALESCE(pd.estado, ''::character varying) AS estado,
    COALESCE(pd."cantidadSolicitadaTotal", (0)::double precision) AS cantidad_solicitada_total,
    COALESCE(pd."totalP2Solicitado", (0)::double precision) AS total_p2_solicitado
   FROM public.pedidos pd;


--
-- Name: vw_rpt_produccion_base; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_produccion_base AS
 SELECT p.id,
    (NULLIF((p.fecha)::text, ''::text))::date AS fecha_d,
    p.fecha,
    p.turno,
    p."tipoProducto",
    p.especie,
    p.aserradero,
    COALESCE(p."cantidadPaquetes", (0)::double precision) AS cantidad_paquetes,
    COALESCE(p."cantidadReservada", (0)::double precision) AS cantidad_reservada,
    GREATEST((0)::double precision, (COALESCE(p."cantidadPaquetes", (0)::double precision) - COALESCE(p."cantidadReservada", (0)::double precision))) AS cantidad_disponible,
    COALESCE(p."piezasPorPaquete", (0)::double precision) AS piezas_por_paquete,
    (GREATEST((0)::double precision, (COALESCE(p."cantidadPaquetes", (0)::double precision) - COALESCE(p."cantidadReservada", (0)::double precision))) * COALESCE(p."piezasPorPaquete", (0)::double precision)) AS piezas_disponibles,
    COALESCE(p.espesor, (0)::double precision) AS espesor,
    COALESCE(p.ancho, (0)::double precision) AS ancho,
    COALESCE(p.largo, (0)::double precision) AS largo,
    p."unidadDimensiones",
    p.separadores,
    p.tacos
   FROM public.produccion p;


--
-- Name: vw_rpt_subproductos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_subproductos AS
 SELECT se.id,
    (NULLIF((se.fecha)::text, ''::text))::date AS fecha_d,
    se.fecha,
    se.aserradero,
    se.tipo,
    se."especieDeclarada" AS especie_declarada,
    COALESCE(se."tnEstimadas", (0)::double precision) AS tn_estimadas,
    se."tnReales" AS tn_reales,
    COALESCE(se."tnReales", se."tnEstimadas", (0)::double precision) AS tn_efectiva,
    COALESCE(se.estado, ''::character varying) AS estado,
    se.referencia,
    se.usuario
   FROM public.subproductos_egresos se;


--
-- Name: vw_rpt_turnos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_turnos AS
 SELECT t.id,
    (NULLIF((t.fecha)::text, ''::text))::date AS fecha_d,
    t.fecha,
    t."tipoTurno" AS tipo_turno,
    COALESCE(t.estado, ''::character varying) AS estado,
    COALESCE(t.aserradero, e.aserradero) AS aserradero,
    t."empleadoId" AS empleado_id,
    COALESCE(e."nombreCompleto", ''::character varying) AS empleado_nombre,
    COALESCE(t.hs, (0)::numeric) AS hs,
    COALESCE(t.pal, (0)::numeric) AS pal,
    COALESCE(t.lim, (0)::numeric) AS lim,
    COALESCE(t.car, (0)::numeric) AS car,
    COALESCE(t.des, (0)::numeric) AS des,
    COALESCE(t.precio, (0)::numeric) AS precio,
    COALESCE(t.pres, (0)::numeric) AS pres,
    t.origen
   FROM (public.turnos_borradores t
     LEFT JOIN public.empleados e ON ((e.id = t."empleadoId")));


--
-- Name: vw_rpt_ventas_remitos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_rpt_ventas_remitos AS
 SELECT s.id,
    s."numeroRemito",
    (NULLIF((s.fecha)::text, ''::text))::date AS fecha_d,
    s.fecha,
    s.aserradero,
    s."clienteId",
    s."clienteNombre",
    s."pedidoId",
    COALESCE(s.estado, ''::character varying) AS estado,
    COALESCE(s."estadoDespacho", ''::character varying) AS estado_despacho,
    COALESCE(s."estadoFacturacion", ''::character varying) AS estado_facturacion,
    COALESCE(s."origenTipo", ''::character varying) AS origen_tipo,
    COALESCE(s."subtotalNeto", (0)::double precision) AS subtotal_neto,
    COALESCE(s."ivaMonto", (0)::double precision) AS iva_monto,
    COALESCE(s.total, (0)::double precision) AS total,
    COALESCE(s."totalP2Despachado", (0)::double precision) AS total_p2_despachado,
    COALESCE(s."toneladasTotal", (0)::double precision) AS toneladas_total,
    COALESCE(s."m2Total", (0)::double precision) AS m2_total,
    COALESCE(s."totalPaquetesDespachados", (0)::double precision) AS total_paquetes,
    COALESCE(s."totalPiezasDespachadas", (0)::double precision) AS total_piezas,
    (((COALESCE(s.estado, ''::character varying))::text = 'ANULADA'::text) OR ((COALESCE(s."estadoDespacho", ''::character varying))::text = 'ANULADO'::text)) AS es_anulada
   FROM public.salidas_stock s;


--
-- Name: adelantos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adelantos ALTER COLUMN id SET DEFAULT nextval('public.adelantos_id_seq'::regclass);


--
-- Name: aprendizaje_paquetes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprendizaje_paquetes ALTER COLUMN id SET DEFAULT nextval('public.aprendizaje_paquetes_id_seq'::regclass);


--
-- Name: areas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas ALTER COLUMN id SET DEFAULT nextval('public.areas_id_seq'::regclass);


--
-- Name: aserraderos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aserraderos ALTER COLUMN id SET DEFAULT nextval('public.aserraderos_id_seq'::regclass);


--
-- Name: backup_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_config ALTER COLUMN id SET DEFAULT nextval('public.backup_config_id_seq'::regclass);


--
-- Name: backup_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_runs ALTER COLUMN id SET DEFAULT nextval('public.backup_runs_id_seq'::regclass);


--
-- Name: cierres_archivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_archivos ALTER COLUMN id SET DEFAULT nextval('public.cierres_archivos_id_seq'::regclass);


--
-- Name: cierres_boveda_pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_boveda_pagos ALTER COLUMN id SET DEFAULT nextval('public.cierres_boveda_pagos_id_seq'::regclass);


--
-- Name: cierres_historial_liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_historial_liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.cierres_historial_liquidaciones_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: conciliacion_coef_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacion_coef_config ALTER COLUMN id SET DEFAULT nextval('public.conciliacion_coef_config_id_seq'::regclass);


--
-- Name: conteos_playa_rollo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_playa_rollo ALTER COLUMN id SET DEFAULT nextval('public.conteos_playa_rollo_id_seq'::regclass);


--
-- Name: conteos_playa_rollo_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_playa_rollo_items ALTER COLUMN id SET DEFAULT nextval('public.conteos_playa_rollo_items_id_seq'::regclass);


--
-- Name: empleados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados ALTER COLUMN id SET DEFAULT nextval('public.empleados_id_seq'::regclass);


--
-- Name: fleteros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleteros ALTER COLUMN id SET DEFAULT nextval('public.fleteros_id_seq'::regclass);


--
-- Name: gastos_comprobantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_comprobantes ALTER COLUMN id SET DEFAULT nextval('public.gastos_comprobantes_id_seq'::regclass);


--
-- Name: gastos_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_lineas ALTER COLUMN id SET DEFAULT nextval('public.gastos_lineas_id_seq'::regclass);


--
-- Name: ingresos_rollos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos_rollos ALTER COLUMN id SET DEFAULT nextval('public.ingresos_rollos_id_seq'::regclass);


--
-- Name: liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.liquidaciones_id_seq'::regclass);


--
-- Name: maderas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maderas ALTER COLUMN id SET DEFAULT nextval('public.maderas_id_seq'::regclass);


--
-- Name: mesas_pallet id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas_pallet ALTER COLUMN id SET DEFAULT nextval('public.mesas_pallet_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: movimientos_cc_fletero id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_cc_fletero ALTER COLUMN id SET DEFAULT nextval('public.movimientos_cc_fletero_id_seq'::regclass);


--
-- Name: pallet_producciones_diarias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_producciones_diarias ALTER COLUMN id SET DEFAULT nextval('public.pallet_producciones_diarias_id_seq'::regclass);


--
-- Name: pallet_recipes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_recipes ALTER COLUMN id SET DEFAULT nextval('public.pallet_recipes_id_seq'::regclass);


--
-- Name: partes_diarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partes_diarios ALTER COLUMN id SET DEFAULT nextval('public.partes_diarios_id_seq'::regclass);


--
-- Name: pedido_asignaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_asignaciones ALTER COLUMN id SET DEFAULT nextval('public.pedido_asignaciones_id_seq'::regclass);


--
-- Name: pedido_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items ALTER COLUMN id SET DEFAULT nextval('public.pedido_items_id_seq'::regclass);


--
-- Name: pedidos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN id SET DEFAULT nextval('public.pedidos_id_seq'::regclass);


--
-- Name: pendientes_produccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendientes_produccion ALTER COLUMN id SET DEFAULT nextval('public.pendientes_produccion_id_seq'::regclass);


--
-- Name: plantaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantaciones ALTER COLUMN id SET DEFAULT nextval('public.plantaciones_id_seq'::regclass);


--
-- Name: produccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion ALTER COLUMN id SET DEFAULT nextval('public.produccion_id_seq'::regclass);


--
-- Name: produccion_entradas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas ALTER COLUMN id SET DEFAULT nextval('public.produccion_entradas_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: proveedores_madera id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores_madera ALTER COLUMN id SET DEFAULT nextval('public.proveedores_madera_id_seq'::regclass);


--
-- Name: quintas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quintas ALTER COLUMN id SET DEFAULT nextval('public.quintas_id_seq'::regclass);


--
-- Name: rubros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubros ALTER COLUMN id SET DEFAULT nextval('public.rubros_id_seq'::regclass);


--
-- Name: salida_stock_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salida_stock_detalles ALTER COLUMN id SET DEFAULT nextval('public.salida_stock_detalles_id_seq'::regclass);


--
-- Name: salidas_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salidas_stock ALTER COLUMN id SET DEFAULT nextval('public.salidas_stock_id_seq'::regclass);


--
-- Name: stock_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items ALTER COLUMN id SET DEFAULT nextval('public.stock_items_id_seq'::regclass);


--
-- Name: subproductos_egresos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subproductos_egresos ALTER COLUMN id SET DEFAULT nextval('public.subproductos_egresos_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: transportes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportes ALTER COLUMN id SET DEFAULT nextval('public.transportes_id_seq'::regclass);


--
-- Name: turnos_borradores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos_borradores ALTER COLUMN id SET DEFAULT nextval('public.turnos_borradores_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: ventas_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_detalles ALTER COLUMN id SET DEFAULT nextval('public.ventas_detalles_id_seq'::regclass);


--
-- Name: ventas_ordenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_ordenes ALTER COLUMN id SET DEFAULT nextval('public.ventas_ordenes_id_seq'::regclass);


--
-- Name: conteos_playa_rollo PK_08a9af40f1852ede814c17c9dde; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_playa_rollo
    ADD CONSTRAINT "PK_08a9af40f1852ede814c17c9dde" PRIMARY KEY (id);


--
-- Name: rubros PK_0cbdfd4b600dcdea4aab513bfab; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubros
    ADD CONSTRAINT "PK_0cbdfd4b600dcdea4aab513bfab" PRIMARY KEY (id);


--
-- Name: stock_items_tags PK_13c29a96369b4b421cc89242e97; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items_tags
    ADD CONSTRAINT "PK_13c29a96369b4b421cc89242e97" PRIMARY KEY ("stockItemsId", "tagsId");


--
-- Name: produccion PK_15e723848d5558dea3b54aa33ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion
    ADD CONSTRAINT "PK_15e723848d5558dea3b54aa33ce" PRIMARY KEY (id);


--
-- Name: proveedores PK_1dcf121f19f362fb1b4c0a493a9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT "PK_1dcf121f19f362fb1b4c0a493a9" PRIMARY KEY (id);


--
-- Name: pedido_asignaciones PK_2495388456b22c828785e1b6383; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_asignaciones
    ADD CONSTRAINT "PK_2495388456b22c828785e1b6383" PRIMARY KEY (id);


--
-- Name: subproductos_egresos PK_2e128df2bac463af1d28e79cdff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subproductos_egresos
    ADD CONSTRAINT "PK_2e128df2bac463af1d28e79cdff" PRIMARY KEY (id);


--
-- Name: proveedores_madera PK_3323e28bb9dfb37a022c18fe11b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores_madera
    ADD CONSTRAINT "PK_3323e28bb9dfb37a022c18fe11b" PRIMARY KEY (id);


--
-- Name: ingresos_rollos PK_3532a8473bd896378c3b74b5a5a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos_rollos
    ADD CONSTRAINT "PK_3532a8473bd896378c3b74b5a5a" PRIMARY KEY (id);


--
-- Name: fleteros PK_3ee58b29788b45bbcdecd9f672f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleteros
    ADD CONSTRAINT "PK_3ee58b29788b45bbcdecd9f672f" PRIMARY KEY (id);


--
-- Name: pallet_recipes PK_41e8973935d9c2881e60512a48f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_recipes
    ADD CONSTRAINT "PK_41e8973935d9c2881e60512a48f" PRIMARY KEY (id);


--
-- Name: adelantos PK_4316ab1e3ef0fb80807174363e2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adelantos
    ADD CONSTRAINT "PK_4316ab1e3ef0fb80807174363e2" PRIMARY KEY (id);


--
-- Name: liquidaciones PK_4ef05a76524d7e92441bdab035a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT "PK_4ef05a76524d7e92441bdab035a" PRIMARY KEY (id);


--
-- Name: areas PK_5110493f6342f34c978c084d0d6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY (id);


--
-- Name: stock_items PK_52a266aa3e04b8ad1f01088f3f0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT "PK_52a266aa3e04b8ad1f01088f3f0" PRIMARY KEY (id);


--
-- Name: plantaciones PK_56b4d2075e5435a78ef02dca369; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantaciones
    ADD CONSTRAINT "PK_56b4d2075e5435a78ef02dca369" PRIMARY KEY (id);


--
-- Name: gastos_comprobantes PK_61867c67cadff86b9f7fb47ca93; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_comprobantes
    ADD CONSTRAINT "PK_61867c67cadff86b9f7fb47ca93" PRIMARY KEY (id);


--
-- Name: produccion_entradas_tags PK_64c6bc9b3be371223b8b17a4d6b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas_tags
    ADD CONSTRAINT "PK_64c6bc9b3be371223b8b17a4d6b" PRIMARY KEY ("produccionEntradasId", "tagsId");


--
-- Name: aprendizaje_paquetes PK_6504dec43d903b15882eac5fc2a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprendizaje_paquetes
    ADD CONSTRAINT "PK_6504dec43d903b15882eac5fc2a" PRIMARY KEY (id);


--
-- Name: salidas_stock PK_6b91e6ba17b55c0fa0eb5f4040a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salidas_stock
    ADD CONSTRAINT "PK_6b91e6ba17b55c0fa0eb5f4040a" PRIMARY KEY (id);


--
-- Name: conteos_playa_rollo_items PK_71c0a5bf3d9944c0c276f1eeb9f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_playa_rollo_items
    ADD CONSTRAINT "PK_71c0a5bf3d9944c0c276f1eeb9f" PRIMARY KEY (id);


--
-- Name: empleados PK_73a63a6fcb4266219be3eb0ce8a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "PK_73a63a6fcb4266219be3eb0ce8a" PRIMARY KEY (id);


--
-- Name: movimientos_cc_fletero PK_7f88fa3ea357655421fb014529d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_cc_fletero
    ADD CONSTRAINT "PK_7f88fa3ea357655421fb014529d" PRIMARY KEY (id);


--
-- Name: maderas PK_82b7f96c6006b02f77a0db61f36; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maderas
    ADD CONSTRAINT "PK_82b7f96c6006b02f77a0db61f36" PRIMARY KEY (id);


--
-- Name: salida_stock_detalles PK_86cfc9844ef495953828d8365e6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salida_stock_detalles
    ADD CONSTRAINT "PK_86cfc9844ef495953828d8365e6" PRIMARY KEY (id);


--
-- Name: partes_diarios PK_8754128c72c797bfdde335ee20d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partes_diarios
    ADD CONSTRAINT "PK_8754128c72c797bfdde335ee20d" PRIMARY KEY (id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: transportes PK_92cfbcdb650f1c6a4c0be3c1ee5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportes
    ADD CONSTRAINT "PK_92cfbcdb650f1c6a4c0be3c1ee5" PRIMARY KEY (id);


--
-- Name: ventas_ordenes PK_972ec1725e6d29c837f77d09c3d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_ordenes
    ADD CONSTRAINT "PK_972ec1725e6d29c837f77d09c3d" PRIMARY KEY (id);


--
-- Name: ventas_detalles PK_9f0d45a2a28df1e30e0d4cd8b57; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_detalles
    ADD CONSTRAINT "PK_9f0d45a2a28df1e30e0d4cd8b57" PRIMARY KEY (id);


--
-- Name: pendientes_produccion PK_b4dacb6642ac1b04866ae00445b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendientes_produccion
    ADD CONSTRAINT "PK_b4dacb6642ac1b04866ae00445b" PRIMARY KEY (id);


--
-- Name: turnos_borradores PK_b844edc15175b7c40534166cc17; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos_borradores
    ADD CONSTRAINT "PK_b844edc15175b7c40534166cc17" PRIMARY KEY (id);


--
-- Name: produccion_entradas PK_c4487a62b44b5f6a23cecdc860e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas
    ADD CONSTRAINT "PK_c4487a62b44b5f6a23cecdc860e" PRIMARY KEY (id);


--
-- Name: pallet_producciones_diarias PK_c82a96fa9c059bf08c2ac0337e9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_producciones_diarias
    ADD CONSTRAINT "PK_c82a96fa9c059bf08c2ac0337e9" PRIMARY KEY (id);


--
-- Name: conciliacion_coef_config PK_cda14a7ab4e7c6d941520e1d5c4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacion_coef_config
    ADD CONSTRAINT "PK_cda14a7ab4e7c6d941520e1d5c4" PRIMARY KEY (id);


--
-- Name: gastos_lineas PK_d6f075f40775f622e0d006a65db; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_lineas
    ADD CONSTRAINT "PK_d6f075f40775f622e0d006a65db" PRIMARY KEY (id);


--
-- Name: usuarios PK_d7281c63c176e152e4c531594a8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY (id);


--
-- Name: clientes PK_d76bf3571d906e4e86470482c08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY (id);


--
-- Name: backup_config PK_db9c8f549e8f67e38acd79eea09; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_config
    ADD CONSTRAINT "PK_db9c8f549e8f67e38acd79eea09" PRIMARY KEY (id);


--
-- Name: quintas PK_de2e16f383c2fa525f817318d36; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quintas
    ADD CONSTRAINT "PK_de2e16f383c2fa525f817318d36" PRIMARY KEY (id);


--
-- Name: sueldos_mensuales PK_def461655060c08bc2b27d2755a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sueldos_mensuales
    ADD CONSTRAINT "PK_def461655060c08bc2b27d2755a" PRIMARY KEY ("empleadoId", anio, mes);


--
-- Name: tags PK_e7dc17249a1148a1970748eda99; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY (id);


--
-- Name: pedidos PK_ebb5680ed29a24efdc586846725; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "PK_ebb5680ed29a24efdc586846725" PRIMARY KEY (id);


--
-- Name: aserraderos PK_f4e13aa2feddeefcef33541fb5a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aserraderos
    ADD CONSTRAINT "PK_f4e13aa2feddeefcef33541fb5a" PRIMARY KEY (id);


--
-- Name: pedido_items PK_f8fa1d930ff13073bc34571ba9d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT "PK_f8fa1d930ff13073bc34571ba9d" PRIMARY KEY (id);


--
-- Name: backup_runs PK_fae0096e47c04baf8723aa492e1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_runs
    ADD CONSTRAINT "PK_fae0096e47c04baf8723aa492e1" PRIMARY KEY (id);


--
-- Name: pedidos UQ_0d6429b8b067916cc704ee1f2f3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "UQ_0d6429b8b067916cc704ee1f2f3" UNIQUE ("numeroPedido");


--
-- Name: usuarios UQ_446adfc18b35418aac32ae0b7b5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE (email);


--
-- Name: empleados UQ_6cf4658b26946cc2f61a6481ea3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "UQ_6cf4658b26946cc2f61a6481ea3" UNIQUE (documento);


--
-- Name: empleados UQ_8bee2a950da864adbb095c41a87; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "UQ_8bee2a950da864adbb095c41a87" UNIQUE (cuil);


--
-- Name: salidas_stock UQ_a200854b96cf35ba0df5eeb2157; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salidas_stock
    ADD CONSTRAINT "UQ_a200854b96cf35ba0df5eeb2157" UNIQUE ("numeroRemito");


--
-- Name: aserraderos UQ_c0c231359d50a5fd1f8b0a65137; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aserraderos
    ADD CONSTRAINT "UQ_c0c231359d50a5fd1f8b0a65137" UNIQUE (nombre);


--
-- Name: tags UQ_c2a1a40029d7949061bff875f77; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "UQ_c2a1a40029d7949061bff875f77" UNIQUE (nombre);


--
-- Name: conciliacion_coef_config UQ_conciliacion_coef_config_aserradero_grupo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacion_coef_config
    ADD CONSTRAINT "UQ_conciliacion_coef_config_aserradero_grupo" UNIQUE (aserradero, "grupoEspecie");


--
-- Name: sueldos_mensuales UQ_def461655060c08bc2b27d2755a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sueldos_mensuales
    ADD CONSTRAINT "UQ_def461655060c08bc2b27d2755a" UNIQUE ("empleadoId", anio, mes);


--
-- Name: ingresos_rollos UQ_ingresos_rollos_proveedor_remito; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos_rollos
    ADD CONSTRAINT "UQ_ingresos_rollos_proveedor_remito" UNIQUE ("proveedorMaderaId", "nroRemito");


--
-- Name: app_installation_state app_installation_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_installation_state
    ADD CONSTRAINT app_installation_state_pkey PRIMARY KEY (id);


--
-- Name: app_licensing_state app_licensing_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_licensing_state
    ADD CONSTRAINT app_licensing_state_pkey PRIMARY KEY (id);


--
-- Name: cierres_archivos cierres_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_archivos
    ADD CONSTRAINT cierres_archivos_pkey PRIMARY KEY (id);


--
-- Name: cierres_boveda_pagos cierres_boveda_pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_boveda_pagos
    ADD CONSTRAINT cierres_boveda_pagos_pkey PRIMARY KEY (id);


--
-- Name: cierres_historial_liquidaciones cierres_historial_liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_historial_liquidaciones
    ADD CONSTRAINT cierres_historial_liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: mesas_pallet mesas_pallet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas_pallet
    ADD CONSTRAINT mesas_pallet_pkey PRIMARY KEY (id);


--
-- Name: IDX_06b7dc0e47feaabfd691c1f042; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_06b7dc0e47feaabfd691c1f042" ON public.salida_stock_detalles USING btree ("salidaStockId");


--
-- Name: IDX_088cc4c6dea3112234da11288b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_088cc4c6dea3112234da11288b" ON public.fleteros USING btree ("transporteId");


--
-- Name: IDX_16950cd31857f90baadd751e6f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_16950cd31857f90baadd751e6f" ON public.salida_stock_detalles USING btree ("pedidoAsignacionId");


--
-- Name: IDX_1ef1d77c583e44acf1951ccff6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1ef1d77c583e44acf1951ccff6" ON public.conteos_playa_rollo USING btree (aserradero);


--
-- Name: IDX_20a0ffdc9b6944c370e30f27c7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_20a0ffdc9b6944c370e30f27c7" ON public.ingresos_rollos USING btree ("proveedorMaderaId");


--
-- Name: IDX_4c5bc70334f6ed2f25b11b88c9; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_4c5bc70334f6ed2f25b11b88c9" ON public.movimientos_cc_fletero USING btree ("ingresoRolloId") WHERE ("ingresoRolloId" IS NOT NULL);


--
-- Name: IDX_4d42a5b92665897ad4cad91fc0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4d42a5b92665897ad4cad91fc0" ON public.pedido_items USING btree ("pedidoId");


--
-- Name: IDX_5254b15308f5012f153858c5ec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5254b15308f5012f153858c5ec" ON public.stock_items_tags USING btree ("tagsId");


--
-- Name: IDX_536c0c64372aec50ab68d6dfcf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_536c0c64372aec50ab68d6dfcf" ON public.subproductos_egresos USING btree (aserradero);


--
-- Name: IDX_580bc20653ca3e298f9e03e336; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_580bc20653ca3e298f9e03e336" ON public.subproductos_egresos USING btree (tipo);


--
-- Name: IDX_5c95f776815932223d23eaae33; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5c95f776815932223d23eaae33" ON public.movimientos_cc_fletero USING btree ("fleteroId");


--
-- Name: IDX_7d08a3d64c050f37cb5a7bb105; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7d08a3d64c050f37cb5a7bb105" ON public.ingresos_rollos USING btree (fecha);


--
-- Name: IDX_85d16fde5752e1c6b7a7bb4aef; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_85d16fde5752e1c6b7a7bb4aef" ON public.ingresos_rollos USING btree (aserradero);


--
-- Name: IDX_8bd4811da2406868607789554d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8bd4811da2406868607789554d" ON public.areas USING btree (aserradero_id, nombre);


--
-- Name: IDX_9ef7a781671bcea51ca087864d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9ef7a781671bcea51ca087864d" ON public.pedido_asignaciones USING btree ("pedidoId");


--
-- Name: IDX_a1aa84917f55fb73b4341f3dff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a1aa84917f55fb73b4341f3dff" ON public.conteos_playa_rollo_items USING btree ("conteoId");


--
-- Name: IDX_a3c45ac9dab5336e8f10e14fcd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a3c45ac9dab5336e8f10e14fcd" ON public.produccion_entradas_tags USING btree ("tagsId");


--
-- Name: IDX_abbd08d495a98f303896842507; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_abbd08d495a98f303896842507" ON public.conteos_playa_rollo USING btree ("fechaCierre");


--
-- Name: IDX_b42afc6b52d94175168efd30c5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b42afc6b52d94175168efd30c5" ON public.salida_stock_detalles USING btree ("produccionId");


--
-- Name: IDX_b49d9484e8c9f015eb32a43dfc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b49d9484e8c9f015eb32a43dfc" ON public.pedido_asignaciones USING btree ("pedidoItemId");


--
-- Name: IDX_b9061f83793d2e4d1de9e05f7e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b9061f83793d2e4d1de9e05f7e" ON public.subproductos_egresos USING btree (fecha);


--
-- Name: IDX_c7a3c9e85a15a9c64af0438b92; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c7a3c9e85a15a9c64af0438b92" ON public.conciliacion_coef_config USING btree ("grupoEspecie");


--
-- Name: IDX_c85714949d81e59d2fcbe9e098; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c85714949d81e59d2fcbe9e098" ON public.conciliacion_coef_config USING btree (aserradero);


--
-- Name: IDX_c8a4ea9e4b7382d0a093258845; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c8a4ea9e4b7382d0a093258845" ON public.movimientos_cc_fletero USING btree (fecha);


--
-- Name: IDX_cc3c3b1e7cd219e92cde982d38; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cc3c3b1e7cd219e92cde982d38" ON public.ingresos_rollos USING btree ("transporteId");


--
-- Name: IDX_cierres_historial_as_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cierres_historial_as_clave" ON public.cierres_historial_liquidaciones USING btree (aserradero, clave);


--
-- Name: IDX_d03298eecec07c0b4d3b2391cf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d03298eecec07c0b4d3b2391cf" ON public.ingresos_rollos USING btree ("maderaId");


--
-- Name: IDX_d24b9b4aebdd6148ee8981af8f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d24b9b4aebdd6148ee8981af8f" ON public.stock_items_tags USING btree ("stockItemsId");


--
-- Name: IDX_dd90796c13f09a973565c9278a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dd90796c13f09a973565c9278a" ON public.ingresos_rollos USING btree ("fleteroId");


--
-- Name: IDX_f950c0f4b3068e929b8e2ca7f8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f950c0f4b3068e929b8e2ca7f8" ON public.produccion_entradas_tags USING btree ("produccionEntradasId");


--
-- Name: IDX_fb563e609ae9000b7399a74623; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fb563e609ae9000b7399a74623" ON public.rubros USING btree (nombre);


--
-- Name: IDX_fe2d81d57694139d3517506057; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fe2d81d57694139d3517506057" ON public.pedido_asignaciones USING btree ("produccionId");


--
-- Name: IDX_gastos_comprobantes_area_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_area_fecha" ON public.gastos_comprobantes USING btree (area_id, fecha);


--
-- Name: IDX_gastos_comprobantes_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_aserradero_fecha" ON public.gastos_comprobantes USING btree (aserradero_id, fecha);


--
-- Name: IDX_gastos_comprobantes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_estado" ON public.gastos_comprobantes USING btree (estado);


--
-- Name: IDX_gastos_comprobantes_mes_anio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_mes_anio" ON public.gastos_comprobantes USING btree (mes, anio);


--
-- Name: IDX_gastos_comprobantes_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_proveedor" ON public.gastos_comprobantes USING btree (proveedor_id);


--
-- Name: IDX_gastos_comprobantes_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_comprobantes_tipo" ON public.gastos_comprobantes USING btree (tipo_comprobante);


--
-- Name: IDX_gastos_lineas_comprobante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_lineas_comprobante" ON public.gastos_lineas USING btree (gasto_comprobante_id);


--
-- Name: IDX_gastos_lineas_rubro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gastos_lineas_rubro" ON public.gastos_lineas USING btree (rubro_id);


--
-- Name: UQ_cierres_archivos_as_idcierre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_cierres_archivos_as_idcierre" ON public.cierres_archivos USING btree (aserradero, "idCierre");


--
-- Name: UQ_cierres_boveda_as_idunico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_cierres_boveda_as_idunico" ON public.cierres_boveda_pagos USING btree (aserradero, "idUnico");


--
-- Name: idx_rpt_adelantos_empleado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_adelantos_empleado_fecha ON public.adelantos USING btree ("empleadoId", fecha);


--
-- Name: idx_rpt_liquidaciones_empleado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_liquidaciones_empleado_fecha ON public.liquidaciones USING btree ("empleadoId", "fechaLiquidacion");


--
-- Name: idx_rpt_pallet_prod_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pallet_prod_aserradero_fecha ON public.pallet_producciones_diarias USING btree (aserradero, fecha);


--
-- Name: idx_rpt_pallet_prod_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pallet_prod_fecha ON public.pallet_producciones_diarias USING btree (fecha);


--
-- Name: idx_rpt_partes_diarios_empleado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_partes_diarios_empleado_fecha ON public.partes_diarios USING btree ("empleadoId", fecha);


--
-- Name: idx_rpt_partes_diarios_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_partes_diarios_fecha ON public.partes_diarios USING btree (fecha);


--
-- Name: idx_rpt_pedidos_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pedidos_aserradero_fecha ON public.pedidos USING btree (aserradero, fecha);


--
-- Name: idx_rpt_pedidos_cliente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pedidos_cliente_fecha ON public.pedidos USING btree ("clienteId", fecha);


--
-- Name: idx_rpt_pedidos_estado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pedidos_estado_fecha ON public.pedidos USING btree (estado, fecha);


--
-- Name: idx_rpt_pendientes_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_pendientes_aserradero_fecha ON public.pendientes_produccion USING btree (aserradero, fecha);


--
-- Name: idx_rpt_produccion_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_produccion_aserradero_fecha ON public.produccion USING btree (aserradero, fecha);


--
-- Name: idx_rpt_produccion_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_produccion_fecha ON public.produccion USING btree (fecha);


--
-- Name: idx_rpt_salidas_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_salidas_aserradero_fecha ON public.salidas_stock USING btree (aserradero, fecha);


--
-- Name: idx_rpt_salidas_cliente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_salidas_cliente_fecha ON public.salidas_stock USING btree ("clienteId", fecha);


--
-- Name: idx_rpt_salidas_estado_despacho_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rpt_salidas_estado_despacho_fecha ON public.salidas_stock USING btree ("estadoDespacho", fecha);


--
-- Name: idx_turnos_borr_aserradero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_borr_aserradero_fecha ON public.turnos_borradores USING btree (aserradero, fecha);


--
-- Name: idx_turnos_borr_empleado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_borr_empleado_fecha ON public.turnos_borradores USING btree ("empleadoId", fecha);


--
-- Name: idx_turnos_borr_estado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_borr_estado_fecha ON public.turnos_borradores USING btree (estado, fecha);


--
-- Name: idx_turnos_borr_fecha_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_borr_fecha_turno ON public.turnos_borradores USING btree (fecha, "tipoTurno");


--
-- Name: uq_areas_aserradero_nombre_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_areas_aserradero_nombre_norm ON public.areas USING btree (aserradero_id, lower(btrim((nombre)::text)));


--
-- Name: uq_gastos_comprobantes_fiscal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_gastos_comprobantes_fiscal ON public.gastos_comprobantes USING btree (proveedor_id, tipo_comprobante, COALESCE(punto_venta, ''::character varying), numero_comprobante) NULLS NOT DISTINCT WHERE (((tipo_comprobante)::text <> ALL ((ARRAY['X'::character varying, 'ACUSE'::character varying, 'RECIBO'::character varying, 'ORDEN'::character varying])::text[])) AND (numero_comprobante IS NOT NULL) AND (btrim((numero_comprobante)::text) <> ''::text));


--
-- Name: uq_rubros_nombre_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_rubros_nombre_norm ON public.rubros USING btree (lower(btrim((nombre)::text)));


--
-- Name: uq_turnos_borr_fecha_turno_empleado; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_turnos_borr_fecha_turno_empleado ON public.turnos_borradores USING btree (fecha, "tipoTurno", "empleadoId");


--
-- Name: salida_stock_detalles FK_06b7dc0e47feaabfd691c1f0425; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salida_stock_detalles
    ADD CONSTRAINT "FK_06b7dc0e47feaabfd691c1f0425" FOREIGN KEY ("salidaStockId") REFERENCES public.salidas_stock(id) ON DELETE CASCADE;


--
-- Name: gastos_comprobantes FK_1cb9ca56beb7a84a40f5e3f5e78; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_comprobantes
    ADD CONSTRAINT "FK_1cb9ca56beb7a84a40f5e3f5e78" FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id);


--
-- Name: gastos_lineas FK_2bdb89611462f5e5ef88c44d3c2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_lineas
    ADD CONSTRAINT "FK_2bdb89611462f5e5ef88c44d3c2" FOREIGN KEY (rubro_id) REFERENCES public.rubros(id);


--
-- Name: produccion_entradas FK_33e64d9eadfd6cb6a93a2bccb7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas
    ADD CONSTRAINT "FK_33e64d9eadfd6cb6a93a2bccb7c" FOREIGN KEY ("stockItemId") REFERENCES public.stock_items(id);


--
-- Name: gastos_comprobantes FK_38825285c79187c1c4c2446f821; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_comprobantes
    ADD CONSTRAINT "FK_38825285c79187c1c4c2446f821" FOREIGN KEY (aserradero_id) REFERENCES public.aserraderos(id);


--
-- Name: adelantos FK_440cf644b77388a0ff7101e9dbe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adelantos
    ADD CONSTRAINT "FK_440cf644b77388a0ff7101e9dbe" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: pedido_items FK_4d42a5b92665897ad4cad91fc09; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT "FK_4d42a5b92665897ad4cad91fc09" FOREIGN KEY ("pedidoId") REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: areas FK_4dc01ea1c0c536c4a04e89ed54a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT "FK_4dc01ea1c0c536c4a04e89ed54a" FOREIGN KEY (aserradero_id) REFERENCES public.aserraderos(id);


--
-- Name: stock_items_tags FK_5254b15308f5012f153858c5ec3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items_tags
    ADD CONSTRAINT "FK_5254b15308f5012f153858c5ec3" FOREIGN KEY ("tagsId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gastos_comprobantes FK_77b17428d14281bc7dc3d212ac0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_comprobantes
    ADD CONSTRAINT "FK_77b17428d14281bc7dc3d212ac0" FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: ventas_detalles FK_9627359db10b9389f22b8106d76; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_detalles
    ADD CONSTRAINT "FK_9627359db10b9389f22b8106d76" FOREIGN KEY ("ordenId") REFERENCES public.ventas_ordenes(id) ON DELETE CASCADE;


--
-- Name: liquidaciones FK_978c1161866007cca7aff4347f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT "FK_978c1161866007cca7aff4347f0" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: pedido_asignaciones FK_9ef7a781671bcea51ca087864d2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_asignaciones
    ADD CONSTRAINT "FK_9ef7a781671bcea51ca087864d2" FOREIGN KEY ("pedidoId") REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: conteos_playa_rollo_items FK_a1aa84917f55fb73b4341f3dff3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_playa_rollo_items
    ADD CONSTRAINT "FK_a1aa84917f55fb73b4341f3dff3" FOREIGN KEY ("conteoId") REFERENCES public.conteos_playa_rollo(id) ON DELETE CASCADE;


--
-- Name: produccion_entradas_tags FK_a3c45ac9dab5336e8f10e14fcde; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas_tags
    ADD CONSTRAINT "FK_a3c45ac9dab5336e8f10e14fcde" FOREIGN KEY ("tagsId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pedido_asignaciones FK_b49d9484e8c9f015eb32a43dfcd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_asignaciones
    ADD CONSTRAINT "FK_b49d9484e8c9f015eb32a43dfcd" FOREIGN KEY ("pedidoItemId") REFERENCES public.pedido_items(id) ON DELETE CASCADE;


--
-- Name: proveedores FK_b74ac145d3d7a5c5f147364c1f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT "FK_b74ac145d3d7a5c5f147364c1f0" FOREIGN KEY (rubro_habitual_id) REFERENCES public.rubros(id);


--
-- Name: gastos_lineas FK_cb7a5a9a3bf3f5c1e4406873e18; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_lineas
    ADD CONSTRAINT "FK_cb7a5a9a3bf3f5c1e4406873e18" FOREIGN KEY (gasto_comprobante_id) REFERENCES public.gastos_comprobantes(id) ON DELETE RESTRICT;


--
-- Name: stock_items_tags FK_d24b9b4aebdd6148ee8981af8ff; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items_tags
    ADD CONSTRAINT "FK_d24b9b4aebdd6148ee8981af8ff" FOREIGN KEY ("stockItemsId") REFERENCES public.stock_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: partes_diarios FK_f0fbb2a5761f9e586082adcef46; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partes_diarios
    ADD CONSTRAINT "FK_f0fbb2a5761f9e586082adcef46" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: produccion_entradas_tags FK_f950c0f4b3068e929b8e2ca7f86; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_entradas_tags
    ADD CONSTRAINT "FK_f950c0f4b3068e929b8e2ca7f86" FOREIGN KEY ("produccionEntradasId") REFERENCES public.produccion_entradas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sueldos_mensuales FK_fd169c13f79b8070ba9d4671051; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sueldos_mensuales
    ADD CONSTRAINT "FK_fd169c13f79b8070ba9d4671051" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'BaselineSchema es irreversible: no hay down seguro. Restaurar desde backup verificado si se requiere revertir.',
    );
  }
}
