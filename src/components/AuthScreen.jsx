/**
 * @fileoverview Pantalla de Autenticación y Registro Corporativo de Ingenieros (`AuthScreen.jsx`).
 *
 * Barrera de acceso estricta: No se muestra la plataforma hasta autenticar con @soyneto.com.
 * Al registrarse, captura la ficha técnica del ingeniero (auto, placas, CECO, tarjeta de gasolina)
 * para automatizar al 100% la generación de bitácoras semanales sin necesidad de rellenar datos manuales.
 */

import { useState } from 'react';
import {
  LockKey,
  EnvelopeSimple,
  User,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  CarProfile,
  GasPump,
  IdentificationBadge,
  ArrowRight,
  Eye,
  EyeSlash,
  Buildings,
} from '@phosphor-icons/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
import { ESTADOS, INGENIEROS } from '@/lib/brand';
import { cn } from '@/lib/utils';

const REGIONES_DEFAULT = ['TUXTLA', 'TAPACHULA', 'VILLAHERMOSA', 'CAMPECHE', 'MERIDA', 'COATZACOALCOS'];

export function AuthScreen({ onAuthSuccess, toast, ingenierosExistentes = [] }) {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Campos de registro / ficha de ingeniero
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
      setErrorMsg('Acceso restringido: Debes usar tu correo con dominio @soyneto.com');
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

      toast?.(`Bienvenido a Rutas Sureste, ${data.user.email}`);
      onAuthSuccess?.(data.user);
    } catch (err) {
      console.error('[Login Error]:', err);
      let msg = err.message || 'Error de autenticación';
      if (msg.includes('Invalid login credentials')) {
        msg = 'Correo o contraseña incorrectos. Si aún no tienes cuenta, usa la pestaña "Registrar Ingeniero".';
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
      setErrorMsg('Ingresa el modelo de tu vehículo asignado (ej. AVEO)');
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

      const { error: dbError } = await supabase
        .from('ingenieros')
        .upsert(perfilPayload, { onConflict: 'nombre' });

      if (dbError) {
        console.warn('Aviso al guardar perfil en BD:', dbError.message);
      }

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
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-foreground overflow-y-auto">
      {/* Fondo decorativo con halos sutiles estilo Apple */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-orange-600/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg my-6">
        {/* ================= TARJETA PRINCIPAL ================= */}
        <Card className="border border-white/10 bg-card/85 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.45)] rounded-3xl overflow-hidden">
          {/* Cabecera de Marca */}
          <div className="p-6 pb-4 text-center border-b border-border/40 space-y-2">
            <div className="flex justify-center mb-1">
              <img
                src="/logo-app.png"
                alt="Tiendas Neto"
                className="h-16 w-16 rounded-2xl p-1 bg-white object-contain shadow-lg border border-border/40 transition-transform hover:scale-105 duration-200"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center justify-center gap-1.5">
                <span>Rutas Sureste</span>
                <span className="text-muted-foreground font-normal">·</span>
                <span className="text-primary font-semibold">Tiendas Neto</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Portal Corporativo de Soporte Técnico y Planeación de Combustible
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-1">
              <Badge
                variant="outline"
                className="text-[10px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1 bg-emerald-500/5 px-2.5 py-0.5"
              >
                <ShieldCheck weight="fill" className="h-3.5 w-3.5 text-emerald-500" />
                <span>Acceso Exclusivo @soyneto.com</span>
              </Badge>
            </div>
          </div>

          {/* Segmented Control: Iniciar Sesión / Registrar Ingeniero */}
          <div className="p-6 pt-4 space-y-4">
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

            {/* Mensaje de Error */}
            {errorMsg && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2 animate-in fade-in duration-200">
                <WarningCircle weight="fill" className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1">{errorMsg}</span>
              </div>
            )}

            {/* ================= FORMULARIO 1: INICIAR SESIÓN ================= */}
            {modo === 'login' && (
              <form onSubmit={handleLogin} className="space-y-3.5">
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
                      className="pl-9 text-xs"
                      required
                      autoFocus
                    />
                  </div>
                  {email && !emailValido && (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <WarningCircle weight="bold" />
                      Debe terminar en @soyneto.com
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs">
                    Contraseña
                  </Label>
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
                      className="pl-9 pr-9 text-xs"
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
                  className="w-full text-xs font-semibold py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                >
                  {cargando ? 'Verificando credenciales…' : 'Entrar a Rutas Sureste'}
                  <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </form>
            )}

            {/* ================= FORMULARIO 2: REGISTRAR INGENIERO ================= */}
            {modo === 'registro' && (
              <form onSubmit={handleRegistro} className="space-y-3.5">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                  Ingresa tus datos y los de tu vehículo. Esta información se usará automáticamente en todas tus bitácoras de gasolina.
                </div>

                {/* Paso 1: Selección o ingreso de nombre */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Nombre del Ingeniero</Label>
                    <button
                      type="button"
                      onClick={() => setEsIngenieroExistente((v) => !v)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {esIngenieroExistente ? 'Escribir otro nombre' : 'Elegir de la lista'}
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
                      <SelectTrigger className="text-xs bg-card">
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
                      className="text-xs font-semibold uppercase"
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
                      placeholder="tu.nombre@soyneto.com"
                      className="text-xs"
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
                      className="text-xs"
                      required
                    />
                  </div>
                </div>

                {/* Ficha Vehicular y Operativa */}
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CarProfile weight="duotone" className="h-4 w-4 text-primary" />
                    <span>Ficha de Vehículo y Operación</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">No. Empleado</Label>
                      <Input
                        value={noEmpleado}
                        onChange={(e) => setNoEmpleado(e.target.value)}
                        placeholder="Ej. 1221362"
                        className="font-mono text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Región</Label>
                      <Input
                        value={region}
                        onChange={(e) => setRegion(e.target.value.toUpperCase())}
                        placeholder="TUXTLA"
                        className="font-mono text-xs uppercase"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">CECO</Label>
                      <Input
                        value={ceco}
                        onChange={(e) => setCeco(e.target.value)}
                        placeholder="108266"
                        className="font-mono text-xs"
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
                        className="text-xs uppercase"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Placas</Label>
                      <Input
                        value={placas}
                        onChange={(e) => setPlacas(e.target.value.toUpperCase())}
                        placeholder="PEB-798-C"
                        className="font-mono text-xs uppercase"
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
                      className="font-mono text-xs"
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
                        className="font-mono text-xs"
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
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={cargando}
                  className="w-full text-xs font-semibold py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                >
                  {cargando ? 'Guardando ficha y creando cuenta…' : 'Crear Cuenta y Entrar'}
                  <ArrowRight weight="bold" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </form>
            )}
          </div>
        </Card>

        {/* Pie de pantalla */}
        <p className="text-center text-[11px] text-slate-500 mt-4">
          Tiendas Neto · Dirección de Operaciones y TI Sureste · 2026
        </p>
      </div>
    </div>
  );
}
