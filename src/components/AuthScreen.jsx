/**
 * @fileoverview Pantalla de Autenticación estilo shadcn `login-02` con layout split screen (`lg:grid-cols-2`).
 *
 * Columna Izquierda: Formulario moderno con tabs de Inicio de Sesión y Registro con Ficha Vehicular.
 * Columna Derecha: Hero visual fotorrealista de Ingeniería de Soporte Técnico Tiendas Neto.
 */

import { useState } from 'react';
import {
  LockKey,
  EnvelopeSimple,
  User,
  ShieldCheck,
  WarningCircle,
  CarProfile,
  GasPump,
  IdentificationBadge,
  ArrowRight,
  Eye,
  EyeSlash,
  Sparkle,
  Buildings,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { supabase, esCorreoSoyNeto } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function AuthScreen({ onAuthSuccess, toast, ingenierosExistentes = [] }) {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Campos de registro y ficha técnica del ingeniero
  const [nombre, setNombre] = useState('');
  const [esIngenieroExistente, setEsIngenieroExistente] = useState(true);
  const [noEmpleado, setNoEmpleado] = useState('');
  const [region, setRegion] = useState('TUXTLA');
  const [automovil, setAutomovil] = useState('AVEO');
  const [placas, setPlacas] = useState('');
  const [serie, setSerie] = useState('');
  const [ceco, setCeco] = useState('108266');
  const [tarjetaGasolina, setTarjetaGasolina] = useState('');
  const [baseNombre, setBaseNombre] = useState('RESGUARDO TUXTLA');
  const [kmInicial, setKmInicial] = useState('17374');
  const [rendimiento, setRendimiento] = useState('12.5');
  const [costoLitro, setCostoLitro] = useState('23.99');

  const emailValido = esCorreoSoyNeto(email);

  // Manejador de Login
  const handleLogin = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo corporativo');
      return;
    }
    if (!esCorreoSoyNeto(cleanEmail)) {
      setErrorMsg('Acceso restringido: Debes usar tu correo oficial @soyneto.com');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setCargando(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      // Vincular auth_id si no estaba vinculado previamente
      if (data?.user) {
        try {
          await supabase
            .from('ingenieros')
            .update({
              auth_id: data.user.id,
              email: cleanEmail,
              updated_at: new Date().toISOString(),
            })
            .ilike('email', cleanEmail);
        } catch {}
      }

      toast?.(`Bienvenido a Rutas Sureste, ${data.user.email}`);
      onAuthSuccess?.(data.user);
    } catch (err) {
      console.error('[Login Error]:', err);
      let msg = err.message || 'Error de autenticación';
      if (msg.includes('Invalid login credentials')) {
        msg = 'Correo o contraseña incorrectos. Si aún no tienes cuenta, haz clic en "Registrar Ingeniero".';
      }
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  };

  // Manejador de Registro con Ficha Vehicular Completa
  const handleRegistro = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanNombre = nombre.trim().toUpperCase();

    if (!cleanNombre) {
      setErrorMsg('Selecciona o escribe tu nombre completo');
      return;
    }
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo corporativo');
      return;
    }
    if (!esCorreoSoyNeto(cleanEmail)) {
      setErrorMsg('Solo se permite registro con correos institucionales @soyneto.com');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Crea una contraseña de al menos 6 caracteres');
      return;
    }
    if (!noEmpleado.trim()) {
      setErrorMsg('Ingresa tu número de empleado');
      return;
    }
    if (!automovil.trim()) {
      setErrorMsg('Ingresa el modelo del vehículo asignado (ej. AVEO)');
      return;
    }
    if (!placas.trim()) {
      setErrorMsg('Ingresa las placas del vehículo');
      return;
    }

    setCargando(true);
    try {
      // 1. Crear usuario en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            nombre: cleanNombre,
            region: region.toUpperCase(),
            no_empleado: noEmpleado.trim(),
            automovil: automovil.trim().toUpperCase(),
            placas: placas.trim().toUpperCase(),
            ceco: ceco.trim(),
            tarjeta_gasolina: tarjetaGasolina.trim(),
            base_nombre: baseNombre.trim(),
            rol: cleanEmail.includes('herwing') ? 'admin' : 'ingeniero',
          },
        },
      });

      if (error) throw error;

      // 2. Guardar ficha completa en la tabla rutas_sureste.ingenieros
      const perfilPayload = {
        nombre: cleanNombre,
        puesto: 'INGENIERO DE SOPORTE TECNICO',
        no_empleado: noEmpleado.trim(),
        tarjeta_gasolina: tarjetaGasolina.trim(),
        automovil: automovil.trim().toUpperCase(),
        placas: placas.trim().toUpperCase(),
        serie: serie.trim().toUpperCase(),
        ceco: ceco.trim() || '108266',
        region: region.trim().toUpperCase() || 'TUXTLA',
        rendimiento: Number(rendimiento) || 12.5,
        costo_litro: Number(costoLitro) || 23.99,
        base_nombre: baseNombre.trim() || 'RESGUARDO TUXTLA',
        km_inicial_ultimo: Number(kmInicial) || 0,
        auth_id: data.user?.id || null,
        email: cleanEmail,
        rol: cleanEmail.includes('herwing') ? 'admin' : 'ingeniero',
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from('ingenieros')
        .upsert(perfilPayload, { onConflict: 'nombre' });

      toast?.(`Cuenta creada para ${cleanNombre}. ¡Bienvenido!`);
      if (data?.user) {
        onAuthSuccess?.(data.user);
      } else {
        setModo('login');
        setErrorMsg('Cuenta registrada con éxito. Ya puedes iniciar sesión.');
      }
    } catch (err) {
      console.error('[Registro Error]:', err);
      let msg = err.message || 'Error al crear la cuenta';
      if (msg.includes('User already registered')) {
        msg = 'Ya existe un usuario con este correo. Inicia sesión en la pestaña correspondiente.';
      }
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-background text-foreground">
      {/* ================= COLUMNA IZQUIERDA: FORMULARIO ================= */}
      <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto">
        {/* Cabecera / Marca */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-app.png"
              alt="Tiendas Neto"
              className="h-9 w-9 rounded-xl object-contain bg-white p-0.5 border border-border/50 shadow-xs"
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight leading-none text-foreground">
                Rutas Sureste
              </span>
              <span className="text-[11px] text-muted-foreground font-medium mt-0.5">
                Tiendas Neto · Soporte TI
              </span>
            </div>
          </div>

          <Badge
            variant="outline"
            className="text-[10px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1 bg-emerald-500/5 px-2 py-0.5"
          >
            <ShieldCheck weight="fill" className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Exclusivo</span> @soyneto.com
          </Badge>
        </div>

        {/* Contenido Central */}
        <div className="my-auto py-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-sm sm:max-w-md space-y-5">
            <div className="space-y-1.5 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {modo === 'login' ? 'Iniciar Sesión' : 'Registro de Ingeniero'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {modo === 'login'
                  ? 'Ingresa con tu correo corporativo para acceder al sistema y a tus bitácoras.'
                  : 'Crea tu cuenta y completa tu ficha vehicular para automatizar tus bitácoras de gasolina.'}
              </p>
            </div>

            {/* Selector de Pestañas Apple Segmented */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border/40">
              <button
                type="button"
                onClick={() => {
                  setModo('login');
                  setErrorMsg('');
                }}
                className={cn(
                  'py-1.5 text-xs font-semibold rounded-lg transition-all',
                  modo === 'login'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setModo('registro');
                  setErrorMsg('');
                }}
                className={cn(
                  'py-1.5 text-xs font-semibold rounded-lg transition-all',
                  modo === 'registro'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Registrar Ingeniero
              </button>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2 animate-in fade-in duration-200">
                <WarningCircle weight="fill" className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1">{errorMsg}</span>
              </div>
            )}

            {/* ================= FORMULARIO LOGIN ================= */}
            {modo === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs">
                    Correo Electrónico Corporativo
                  </Label>
                  <div className="relative">
                    <EnvelopeSimple
                      weight="duotone"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre.apellido@soyneto.com"
                      className="pl-9 text-xs h-10"
                      required
                      autoFocus
                    />
                  </div>
                  {email && !emailValido && (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <WarningCircle weight="bold" />
                      Debe pertenecer al dominio @soyneto.com
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-xs">
                      Contraseña
                    </Label>
                  </div>
                  <div className="relative">
                    <LockKey
                      weight="duotone"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9 pr-9 text-xs h-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={cargando || !emailValido}
                  className="w-full text-xs font-semibold py-2.5 h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                >
                  {cargando ? 'Accediendo a la red…' : 'Entrar a Rutas Sureste'}
                  <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </form>
            )}

            {/* ================= FORMULARIO REGISTRO INGENIERO ================= */}
            {modo === 'registro' && (
              <form onSubmit={handleRegistro} className="space-y-3.5">
                {/* Paso 1: Nombre */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Nombre Completo del Ingeniero</Label>
                    <button
                      type="button"
                      onClick={() => setEsIngenieroExistente((v) => !v)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {esIngenieroExistente ? 'Escribir nombre manual' : 'Elegir de la plantilla'}
                    </button>
                  </div>

                  {esIngenieroExistente ? (
                    <Select
                      value={nombre}
                      onValueChange={(val) => {
                        setNombre(val);
                        const match = ingenierosExistentes.find((i) => i.nombre === val);
                        if (match) {
                          if (match.region) setRegion(match.region);
                          if (match.automovil) setAutomovil(match.automovil);
                          if (match.placas) setPlacas(match.placas);
                          if (match.no_empleado) setNoEmpleado(match.no_empleado);
                          if (match.tarjeta_gasolina) setTarjetaGasolina(match.tarjeta_gasolina);
                          if (match.ceco) setCeco(match.ceco);
                        }
                      }}
                    >
                      <SelectTrigger className="text-xs bg-card h-9">
                        <SelectValue placeholder="Selecciona tu nombre..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ingenierosExistentes.map((ing) => (
                          <SelectItem key={ing.nombre} value={ing.nombre}>
                            {ing.nombre} ({ing.region || 'SURESTE'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value.toUpperCase())}
                      placeholder="NOMBRE COMPLETO (APELLIDOS Y NOMBRES)"
                      className="text-xs font-semibold uppercase h-9"
                      required
                    />
                  )}
                </div>

                {/* Correo y Contraseña */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Correo @soyneto.com</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@soyneto.com"
                      className="text-xs h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Contraseña</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 car."
                      className="text-xs h-9"
                      required
                    />
                  </div>
                </div>

                {/* Ficha Vehicular y Operativa */}
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CarProfile weight="duotone" className="h-4 w-4 text-primary" />
                    <span>Ficha Vehicular (para Bitácora Automática)</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">No. Empleado</Label>
                      <Input
                        value={noEmpleado}
                        onChange={(e) => setNoEmpleado(e.target.value)}
                        placeholder="Ej. 1221362"
                        className="font-mono text-xs h-8"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Región</Label>
                      <Input
                        value={region}
                        onChange={(e) => setRegion(e.target.value.toUpperCase())}
                        placeholder="TUXTLA"
                        className="font-mono text-xs uppercase h-8"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">CECO</Label>
                      <Input
                        value={ceco}
                        onChange={(e) => setCeco(e.target.value)}
                        placeholder="108266"
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Vehículo (Modelo)</Label>
                      <Input
                        value={automovil}
                        onChange={(e) => setAutomovil(e.target.value.toUpperCase())}
                        placeholder="AVEO"
                        className="text-xs uppercase h-8"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Placas</Label>
                      <Input
                        value={placas}
                        onChange={(e) => setPlacas(e.target.value.toUpperCase())}
                        placeholder="PEB-798-C"
                        className="font-mono text-xs uppercase h-8"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Tarjeta de Gasolina (16 dígitos)
                    </Label>
                    <Input
                      value={tarjetaGasolina}
                      onChange={(e) => setTarjetaGasolina(e.target.value)}
                      placeholder="5064490100458236"
                      className="font-mono text-xs h-8"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Odómetro Inicial (km)
                      </Label>
                      <Input
                        type="number"
                        value={kmInicial}
                        onChange={(e) => setKmInicial(e.target.value)}
                        className="font-mono text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Rendimiento (km / L)
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={rendimiento}
                        onChange={(e) => setRendimiento(e.target.value)}
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={cargando}
                  className="w-full text-xs font-semibold py-2.5 h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                >
                  {cargando ? 'Guardando ficha y creando cuenta…' : 'Crear Cuenta y Entrar'}
                  <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Pie de pantalla */}
        <div className="text-center sm:text-left text-[11px] text-muted-foreground pt-4 border-t border-border/40">
          Tiendas Neto · Dirección de TI y Operaciones Sureste · 2026
        </div>
      </div>

      {/* ================= COLUMNA DERECHA: HERO VISUAL DEL INGENIERO ================= */}
      <div className="relative hidden lg:block bg-slate-950 overflow-hidden">
        <img
          src="/hero-ingeniero.png"
          alt="Ingeniero de Soporte Técnico Tiendas Neto"
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(e) => {
            // Fallback si la imagen aún no está generada o no carga
            e.currentTarget.style.display = 'none';
          }}
        />

        {/* Gradiente cinemático estilo Apple */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/10" />

        {/* Tarjeta de testimonio / lema corporativo */}
        <div className="absolute bottom-10 left-10 right-10 p-6 rounded-2xl bg-card/75 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              Red de Soporte Operativo Sureste
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-relaxed">
            «Conectando y respaldando cada sucursal de Tiendas Neto en Chiapas, Tabasco, Campeche y Yucatán con planeación inteligente y cero margen de error.»
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
            <span className="font-semibold text-foreground">Soporte Técnico de Campo</span>
            <span>Tiendas Neto · 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
