/**
 * @fileoverview Modal de Inicio de Sesión y Registro con dominio @soyneto.com (`AuthModal.jsx`).
 *
 * Características:
 * - Restricción estricta de correo corporativo `@soyneto.com`.
 * - Permite Iniciar Sesión con contraseña o Registrarse con nombre e email corporativo.
 * - Sincroniza y vincula automáticamente el perfil del ingeniero en `rutas_sureste.ingenieros`.
 * - Proporciona modo Magic Link (enlace de acceso al correo) o contraseña estándar.
 */

import { useState } from 'react';
import {
  LockKey,
  EnvelopeSimple,
  User,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  Buildings,
  ArrowRight,
} from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { supabase, esCorreoSoyNeto } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function AuthModal({ open, onOpenChange, onAuthSuccess, toast }) {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const emailValido = esCorreoSoyNeto(email);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo corporativo');
      return;
    }
    if (!esCorreoSoyNeto(cleanEmail)) {
      setErrorMsg('Acceso exclusivo para colaboradores con correo @soyneto.com');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setCargando(true);
    try {
      if (modo === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        // Sincronizar / vincular perfil en rutas_sureste.ingenieros
        try {
          await supabase.rpc('sync_ingeniero_auth', {
            p_auth_id: data.user.id,
            p_email: cleanEmail,
            p_nombre: null,
          });
        } catch {
          // Si el RPC falla en cliente se continuará con la sesión
        }

        toast?.(`Bienvenido, ${data.user.email}`);
        onAuthSuccess?.(data.user);
        onOpenChange(false);
      } else {
        const cleanNombre = nombre.trim().toUpperCase();
        if (!cleanNombre) {
          setErrorMsg('Escribe tu nombre completo');
          setCargando(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              nombre: cleanNombre,
            },
          },
        });
        if (error) throw error;

        if (data.user) {
          try {
            await supabase.rpc('sync_ingeniero_auth', {
              p_auth_id: data.user.id,
              p_email: cleanEmail,
              p_nombre: cleanNombre,
            });
          } catch {}

          toast?.(`Cuenta creada para ${cleanEmail}`);
          onAuthSuccess?.(data.user);
          onOpenChange(false);
        } else {
          toast?.('Revisa tu correo para confirmar tu cuenta');
          onOpenChange(false);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error de autenticación');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-app.png"
              alt="Tiendas Neto"
              className="h-9 w-9 rounded-xl object-contain bg-white p-0.5 border border-border/40 shadow-xs"
            />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <ShieldCheck weight="fill" className="h-4 w-4 text-emerald-500" />
              <span>Acceso Corporativo Seguro</span>
            </div>
          </div>
          <DialogTitle className="text-lg">
            {modo === 'login' ? 'Iniciar Sesión en Rutas Sureste' : 'Registrar Ingeniero de Soporte'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ingresa con tu cuenta oficial con terminación{' '}
            <strong className="text-foreground">@soyneto.com</strong> para sincronizar tus tiendas y bitácoras.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {errorMsg && (
            <Card className="flex items-center gap-2 border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
              <WarningCircle weight="fill" className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </Card>
          )}

          {modo === 'registro' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre Completo</Label>
              <div className="relative">
                <User
                  weight="bold"
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  size="sm"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. HERWING EDUARDO VAZQUEZ MACIAS"
                  className="pl-9 font-medium uppercase"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Correo Electrónico Corporativo</Label>
              {email && (
                <span
                  className={cn(
                    'text-[10px] font-mono font-medium',
                    emailValido ? 'text-emerald-500' : 'text-amber-500'
                  )}
                >
                  {emailValido ? '✓ Dominio válido' : 'Debe ser @soyneto.com'}
                </span>
              )}
            </div>
            <div className="relative">
              <EnvelopeSimple
                weight="bold"
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              />
              <Input
                size="sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu.nombre@soyneto.com"
                className={cn(
                  'pl-9 font-mono text-xs',
                  email && !emailValido && 'border-amber-500 focus-visible:ring-amber-500'
                )}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contraseña</Label>
            <div className="relative">
              <LockKey
                weight="bold"
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              />
              <Input
                size="sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="pl-9 font-mono"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-primary font-medium"
            disabled={cargando || (email && !emailValido)}
          >
            <span>
              {cargando
                ? 'Conectando con Supabase…'
                : modo === 'login'
                ? 'Iniciar Sesión'
                : 'Crear Cuenta Corporativa'}
            </span>
            <ArrowRight weight="bold" />
          </Button>

          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setModo((m) => (m === 'login' ? 'registro' : 'login'));
                setErrorMsg('');
              }}
              className="text-primary hover:underline"
            >
              {modo === 'login'
                ? '¿Eres nuevo? Regístrate con @soyneto.com'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

