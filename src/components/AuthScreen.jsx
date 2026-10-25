/**
 * @fileoverview Pantalla de Autenticación estilo shadcn `login-02` con layout split screen.
 *
 * Columna Izquierda: Formulario minimalista de Inicio de Sesión y Registro rápido.
 * Columna Derecha: Hero visual corporativo de Soporte Técnico Tiendas Neto en CIA Sureste.
 */

import { useState } from 'react';
import {
  LockKey,
  EnvelopeSimple,
  User,
  WarningCircle,
  ArrowRight,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // Registro simplificado
  const [nombre, setNombre] = useState('');
  const [esIngenieroExistente, setEsIngenieroExistente] = useState(true);

  const emailValido = esCorreoSoyNeto(email);

  // Manejador de Login
  const handleLogin = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo institucional');
      return;
    }
    if (!esCorreoSoyNeto(cleanEmail)) {
      setErrorMsg('Debes ingresar con un correo oficial @soyneto.com');
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

      // Vincular auth_id si no estaba vinculado
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

      toast?.(`Bienvenido, ${data.user.email}`);
      onAuthSuccess?.(data.user);
    } catch (err) {
      console.error('[Login Error]:', err);
      let msg = err.message || 'Error de autenticación';
      if (msg.includes('Invalid login credentials')) {
        msg = 'Correo o contraseña incorrectos. Si aún no tienes cuenta, ve a la pestaña "Registrarte".';
      }
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  };

  // Manejador de Registro Rápido (3 campos sin fricción)
  const handleRegistro = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanNombre = nombre.trim().toUpperCase();

    if (!cleanNombre) {
      setErrorMsg('Selecciona o ingresa tu nombre completo');
      return;
    }
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo institucional');
      return;
    }
    if (!esCorreoSoyNeto(cleanEmail)) {
      setErrorMsg('El registro requiere un correo @soyneto.com');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
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
            rol: cleanEmail.includes('herwing') ? 'admin' : 'ingeniero',
          },
        },
      });

      if (error) throw error;

      // 2. Asociar o registrar en la tabla de ingenieros
      const { data: existente } = await supabase
        .from('ingenieros')
        .select('*')
        .eq('nombre', cleanNombre)
        .maybeSingle();

      if (existente) {
        await supabase
          .from('ingenieros')
          .update({
            auth_id: data.user?.id || null,
            email: cleanEmail,
            rol: cleanEmail.includes('herwing') ? 'admin' : existente.rol || 'ingeniero',
            updated_at: new Date().toISOString(),
          })
          .eq('nombre', cleanNombre);
      } else {
        await supabase.from('ingenieros').insert({
          nombre: cleanNombre,
          puesto: 'INGENIERO DE SOPORTE TECNICO',
          email: cleanEmail,
          auth_id: data.user?.id || null,
          rol: cleanEmail.includes('herwing') ? 'admin' : 'ingeniero',
          updated_at: new Date().toISOString(),
        });
      }

      toast?.(`Cuenta creada para ${cleanNombre}. ¡Bienvenido!`);
      if (data?.user) {
        onAuthSuccess?.(data.user);
      } else {
        setModo('login');
        setErrorMsg('Cuenta registrada correctamente. Ya puedes iniciar sesión.');
      }
    } catch (err) {
      console.error('[Registro Error]:', err);
      let msg = err.message || 'Error al crear la cuenta';
      if (msg.includes('User already registered')) {
        msg = 'Ya existe una cuenta con este correo. Inicia sesión en la pestaña correspondiente.';
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
                Tiendas Neto · Soporte Técnico
              </span>
            </div>
          </div>

          <span className="text-xs font-mono font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/40">
            CIA Sureste
          </span>
        </div>

        {/* Contenido Central */}
        <div className="my-auto py-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-sm sm:max-w-md space-y-5">
            <div className="space-y-1.5 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {modo === 'login' ? 'Iniciar Sesión' : 'Registrarte'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {modo === 'login'
                  ? 'Ingresa con tu correo institucional para continuar.'
                  : 'Crea tu cuenta institucional @soyneto.com para comenzar.'}
              </p>
            </div>

            {/* Segmented Control */}
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
                Registrarte
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
                    Correo institucional
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
                  {cargando ? 'Iniciando sesión…' : 'Iniciar Sesión'}
                  <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </form>
            )}

            {/* ================= FORMULARIO REGISTRO RÁPIDO ================= */}
            {modo === 'registro' && (
              <form onSubmit={handleRegistro} className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Nombre Completo</Label>
                    <button
                      type="button"
                      onClick={() => setEsIngenieroExistente((v) => !v)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {esIngenieroExistente ? 'Escribir manual' : 'Elegir del equipo'}
                    </button>
                  </div>

                  {esIngenieroExistente ? (
                    <Select value={nombre} onValueChange={(val) => setNombre(val)}>
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
                    <div className="relative">
                      <User
                        weight="duotone"
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                      />
                      <Input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value.toUpperCase())}
                        placeholder="NOMBRE COMPLETO"
                        className="pl-9 text-xs font-semibold uppercase h-9"
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Correo institucional</Label>
                  <div className="relative">
                    <EnvelopeSimple
                      weight="duotone"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre.apellido@soyneto.com"
                      className="pl-9 text-xs h-9"
                      required
                    />
                  </div>
                  {email && !emailValido && (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <WarningCircle weight="bold" />
                      Debe ser @soyneto.com
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Contraseña</Label>
                  <div className="relative">
                    <LockKey
                      weight="duotone"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="pl-9 pr-9 text-xs h-9"
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

                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={cargando || !emailValido}
                    className="w-full text-xs font-semibold py-2.5 h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                  >
                    {cargando ? 'Creando cuenta…' : 'Crear Cuenta'}
                    <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  Configurarás tu ficha vehicular y odómetro al ingresar al sistema.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Pie de pantalla */}
        <div className="text-center sm:text-left text-[11px] text-muted-foreground pt-4 border-t border-border/40">
          Tiendas Neto · Soporte Técnico CIA Sureste
        </div>
      </div>

      {/* ================= COLUMNA DERECHA: HERO VISUAL DEL INGENIERO ================= */}
      <div className="relative hidden lg:block bg-slate-950 overflow-hidden">
        <img
          src="/hero-ingeniero.png"
          alt="Soporte Técnico Tiendas Neto"
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />

        {/* Gradiente */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-slate-950/10" />

        {/* Tarjeta corporativa limpia */}
        <div className="absolute bottom-8 left-8 right-8 p-5 rounded-2xl bg-card/85 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              Soporte Técnico · CIA Sureste
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-relaxed">
            Planeación y ruteo de visitas a sucursales en CIA Sureste.
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
            <span className="font-semibold text-foreground">Soporte Técnico</span>
            <span>Tiendas Neto</span>
          </div>
        </div>
      </div>
    </div>
  );
}
