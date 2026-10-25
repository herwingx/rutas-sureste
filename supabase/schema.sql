-- ==============================================================================
-- RUTAS SURESTE — Esquema de Base de Datos para Supabase (PostgreSQL + PostGIS)
-- ==============================================================================
-- Este script crea el schema aislado `rutas_sureste`, tablas (`tiendas`,
-- `ingenieros`, `rutas_historial`), índices geoespaciales GIST y políticas RLS.
-- ==============================================================================

-- 1. Habilitar extensión geoespacial PostGIS
create extension if not exists postgis with schema extensions;

-- 2. Crear schema dedicado para Rutas Sureste
create schema if not exists rutas_sureste;
grant usage on schema rutas_sureste to anon, authenticated, service_role;

-- 3. Tabla maestra de Tiendas
create table if not exists rutas_sureste.tiendas (
    id bigint generated always as identity primary key,
    eco text not null default '0',
    ceco text not null default '0',
    nombre text not null unique,
    coords text not null,
    coords_anteriores text,
    lat double precision,
    lng double precision,
    estado text not null default 'Chiapas',
    region text not null default 'SURESTE',
    empresa text not null default 'SURESTE',
    zona text not null default '',
    ingeniero text not null default '',
    verificada boolean not null default false,
    fecha_verificacion date,
    geom extensions.geography(Point, 4326) generated always as (
        case 
            when lat is not null and lng is not null 
            then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography 
            else null 
        end
    ) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tiendas_eco on rutas_sureste.tiendas (eco);
create index if not exists idx_tiendas_ceco on rutas_sureste.tiendas (ceco);
create index if not exists idx_tiendas_ingeniero on rutas_sureste.tiendas (ingeniero);
create index if not exists idx_tiendas_estado on rutas_sureste.tiendas (estado);
create index if not exists idx_tiendas_zona on rutas_sureste.tiendas (zona);
create index if not exists idx_tiendas_verificada on rutas_sureste.tiendas (verificada);
create index if not exists idx_tiendas_geom on rutas_sureste.tiendas using gist (geom);

-- 4. Tabla de Perfiles de Ingenieros (datos para Bitácora Oficial Tiendas Neto)
create table if not exists rutas_sureste.ingenieros (
    id bigint generated always as identity primary key,
    nombre text not null unique,
    puesto text not null default 'INGENIERO DE SOPORTE TECNICO',
    no_empleado text not null default '',
    tarjeta_gasolina text not null default '',
    automovil text not null default '',
    placas text not null default '',
    serie text not null default '',
    ceco text not null default '',
    region text not null default 'TUXTLA',
    rendimiento numeric(6,2) not null default 12.5,
    costo_litro numeric(6,2) not null default 23.99,
    base_nombre text not null default 'RESGUARDO TUXTLA',
    domicilio_direccion text not null default '',
    domicilio_link text not null default '',
    km_inicial_ultimo integer not null default 0,
    updated_at timestamptz not null default now()
);

-- 5. Tabla de Historial de Rutas Diarias
create table if not exists rutas_sureste.rutas_historial (
    id bigint generated always as identity primary key,
    uuid text unique,
    fecha date not null default current_date,
    nombre text,
    paradas jsonb not null default '[]'::jsonb,
    tramos jsonb not null default '[]'::jsonb,
    base_inicio boolean not null default true,
    base_fin boolean not null default true,
    total_km numeric(10, 2) not null default 0,
    costo numeric(10, 2) not null default 0,
    litros numeric(10, 2) not null default 0,
    duracion_segundos integer not null default 0,
    ingeniero text,
    created_at timestamptz not null default now()
);

create index if not exists idx_rutas_historial_fecha on rutas_sureste.rutas_historial (fecha desc);
create index if not exists idx_rutas_historial_ingeniero on rutas_sureste.rutas_historial (ingeniero);

-- 6. Trigger para actualizar `updated_at`
create or replace function rutas_sureste.update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create or replace trigger trg_tiendas_updated_at
    before update on rutas_sureste.tiendas
    for each row
    execute function rutas_sureste.update_updated_at_column();

-- 7. Seguridad a Nivel de Filas (RLS) y Permisos
alter table rutas_sureste.tiendas enable row level security;
alter table rutas_sureste.ingenieros enable row level security;
alter table rutas_sureste.rutas_historial enable row level security;

grant all on all tables in schema rutas_sureste to anon, authenticated, service_role;
grant all on all sequences in schema rutas_sureste to anon, authenticated, service_role;
