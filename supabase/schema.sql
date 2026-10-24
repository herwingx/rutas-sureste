-- ==============================================================================
-- RUTAS SURESTE — Esquema de Base de Datos para Supabase (PostgreSQL + PostGIS)
-- ==============================================================================
-- Este script crea las tablas, índices geoespaciales y políticas de seguridad (RLS)
-- necesarias para sincronizar el catálogo multi-ingeniero del Sureste mexicano.
--
-- Ejecuta este script en el "SQL Editor" de tu proyecto de Supabase.
-- ==============================================================================

-- 1. Habilitar extensión geoespacial PostGIS
create extension if not exists postgis;

-- 2. Tabla maestra de Tiendas
create table if not exists public.tiendas (
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
    -- Columna de geometría PostGIS calculada automáticamente para consultas espaciales rápidas
    geom geography(Point, 4326) generated always as (
        case 
            when lat is not null and lng is not null 
            then st_setsrid(st_makepoint(lng, lat), 4326)::geography 
            else null 
        end
    ) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Índices de aceleración
create index if not exists idx_tiendas_eco on public.tiendas (eco);
create index if not exists idx_tiendas_ceco on public.tiendas (ceco);
create index if not exists idx_tiendas_ingeniero on public.tiendas (ingeniero);
create index if not exists idx_tiendas_estado on public.tiendas (estado);
create index if not exists idx_tiendas_zona on public.tiendas (zona);
create index if not exists idx_tiendas_verificada on public.tiendas (verificada);
create index if not exists idx_tiendas_geom on public.tiendas using gist (geom);

-- 4. Tabla de Historial de Rutas Diarias
create table if not exists public.rutas_historial (
    id bigint generated always as identity primary key,
    fecha date not null default current_date,
    nombre text,
    paradas jsonb not null default '[]'::jsonb,
    total_km numeric(10, 2) not null default 0,
    costo numeric(10, 2) not null default 0,
    litros numeric(10, 2) not null default 0,
    duracion_segundos integer not null default 0,
    ingeniero text,
    created_at timestamptz not null default now()
);

create index if not exists idx_rutas_historial_fecha on public.rutas_historial (fecha desc);
create index if not exists idx_rutas_historial_ingeniero on public.rutas_historial (ingeniero);

-- 5. Trigger para actualizar el timestamp `updated_at` en tiendas
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tiendas_updated_at on public.tiendas;
create trigger trg_tiendas_updated_at
    before update on public.tiendas
    for each row
    execute function public.update_updated_at_column();

-- 6. Seguridad a Nivel de Filas (Row Level Security - RLS)
alter table public.tiendas enable row level security;
alter table public.rutas_historial enable row level security;

-- Política de lectura pública: cualquier usuario autenticado o cliente autorizado puede leer
create policy "Lectura abierta de tiendas"
    on public.tiendas for select
    using (true);

create policy "Lectura abierta de historial"
    on public.rutas_historial for select
    using (true);

-- Política de escritura: permite inserción y actualización
create policy "Escritura de tiendas autorizada"
    on public.tiendas for all
    using (true)
    with check (true);

create policy "Escritura de historial autorizada"
    on public.rutas_historial for all
    using (true)
    with check (true);

-- ==============================================================================
-- Función de conveniencia: Buscar tiendas cercanas por radio (en metros)
-- ==============================================================================
create or replace function public.tiendas_cercanas(
    origen_lat double precision,
    origen_lng double precision,
    radio_metros double precision default 25000
)
returns table (
    id bigint,
    eco text,
    nombre text,
    distancia_metros double precision,
    lat double precision,
    lng double precision,
    zona text,
    ingeniero text
) language sql stable as $$
    select 
        t.id,
        t.eco,
        t.nombre,
        st_distance(t.geom, st_setsrid(st_makepoint(origen_lng, origen_lat), 4326)::geography) as distancia_metros,
        t.lat,
        t.lng,
        t.zona,
        t.ingeniero
    from public.tiendas t
    where t.geom is not null
      and st_dwithin(t.geom, st_setsrid(st_makepoint(origen_lng, origen_lat), 4326)::geography, radio_metros)
    order by distancia_metros asc;
$$;
