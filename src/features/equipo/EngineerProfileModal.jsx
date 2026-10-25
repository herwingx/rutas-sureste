/**
 * @fileoverview Modal de Onboarding y Configuración de Ficha Vehicular (`EngineerProfileModal.jsx`).
 *
 * Permite a cualquier ingeniero de Soporte Técnico configurar y actualizar sus datos vehiculares
 * (No. Empleado, Región, CECO, Vehículo, Placas, Tarjeta de gasolina 16 dígitos, Odómetro semanal).
 *
 * Se utiliza como:
 * 1. Modal de Onboarding obligatorio/guiado en el primer inicio de sesión si faltan datos.
 * 2. Editor permanente accesible desde el header para actualizar el odómetro cada semana.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  CarProfile,
  IdentificationBadge,
  WarningCircle,
  FloppyDiskBack,
  Speedometer,
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/utils';

export const REGIONES_SURESTE = [
  'CHIAPAS',
  'CHIAPAS SOCONUSCO',
  'TABASCO',
  'COATZA OLMECA',
  'YUCATAN',
  'CAMPECHE',
  'QUINTANA ROO',
];

/**
 * Determina si la ficha vehicular de un ingeniero cuenta con los datos indispensables
 * para emitir la bitácora oficial (.xlsx) de anticipo y comprobación.
 */
export function esFichaCompleta(perfil) {
  if (!perfil) return false;
  return Boolean(
    String(perfil.no_empleado || '').trim() &&
    String(perfil.placas || '').trim() &&
    String(perfil.tarjeta_gasolina || '').trim() &&
    String(perfil.automovil || '').trim()
  );
}

export function EngineerProfileModal({
  open,
  onOpenChange,
  perfil,
  onSaveSuccess,
  isOnboarding = false,
  tiendas = [],
  toast,
}) {
  const [noEmpleado, setNoEmpleado] = useState('');
  const [region, setRegion] = useState('TUXTLA');
  const [ceco, setCeco] = useState('108266');
  const [automovil, setAutomovil] = useState('AVEO');
  const [placas, setPlacas] = useState('');
  const [serie, setSerie] = useState('');
  const [tarjetaGasolina, setTarjetaGasolina] = useState('');
  const [baseNombre, setBaseNombre] = useState('RESGUARDO TUXTLA');
  const [kmInicial, setKmInicial] = useState('17374');
  const [rendimiento, setRendimiento] = useState('12.5');
  const [costoLitro, setCostoLitro] = useState('23.99');
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sincronizar datos al abrir o cambiar perfil
  useEffect(() => {
    if (perfil) {
      setNoEmpleado(perfil.no_empleado || '');
      setRegion(perfil.region || 'CHIAPAS');
      setCeco(perfil.ceco || '108266');
      setAutomovil(perfil.automovil || 'AVEO');
      setPlacas(perfil.placas || '');
      setSerie(perfil.serie || '');
      setTarjetaGasolina(perfil.tarjeta_gasolina || '');
      setBaseNombre(perfil.base_nombre || 'RESGUARDO TUXTLA');
      setKmInicial(String(perfil.km_inicial_ultimo || '17374'));
      setRendimiento(String(perfil.rendimiento || '12.5'));
      setCostoLitro(String(perfil.costo_litro || '23.99'));
    }
  }, [perfil, open]);

  const tiendasDeRegion = useMemo(() => {
    if (!tiendas.length) return [];
    const normReg = (region || '').toUpperCase().trim();
    const deRegion = tiendas.filter(
      (t) =>
        (t.region && t.region.toUpperCase().trim() === normReg) ||
        t.nombre.includes('RESGUARDO') ||
        t.nombre.includes('CEDIS') ||
        t.nombre.includes('CROSS') ||
        t.nombre.includes('DOCK')
    );
    return deRegion.length > 0 ? deRegion : tiendas;
  }, [tiendas, region]);

  const handleRegionChange = (nuevaRegion) => {
    setRegion(nuevaRegion);
    const normNueva = nuevaRegion.toUpperCase().trim();
    const candidatas = tiendas.filter(
      (t) => t.region && t.region.toUpperCase().trim() === normNueva
    );
    if (candidatas.length > 0) {
      const tieneBaseActual = candidatas.some((t) => t.nombre === baseNombre);
      if (!tieneBaseActual) {
        const resguardo =
          candidatas.find(
            (t) =>
              t.nombre.includes('RESGUARDO') ||
              t.nombre.includes('CEDIS') ||
              t.nombre.includes('CROSS') ||
              t.nombre.includes('DOCK')
          ) || candidatas[0];
        if (resguardo) setBaseNombre(resguardo.nombre);
      }
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    if (!noEmpleado.trim()) {
      setErrorMsg('Ingresa tu número de empleado');
      return;
    }
    if (!automovil.trim()) {
      setErrorMsg('Ingresa el modelo del automóvil');
      return;
    }
    if (!placas.trim()) {
      setErrorMsg('Ingresa las placas del vehículo');
      return;
    }
    if (!tarjetaGasolina.trim() || tarjetaGasolina.replace(/\s+/g, '').length < 10) {
      setErrorMsg('Ingresa los dígitos de tu tarjeta de gasolina');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: perfil?.nombre,
        puesto: perfil?.puesto || 'INGENIERO DE SOPORTE TECNICO',
        no_empleado: noEmpleado.trim(),
        region: region.trim().toUpperCase() || 'TUXTLA',
        ceco: ceco.trim() || '108266',
        automovil: automovil.trim().toUpperCase(),
        placas: placas.trim().toUpperCase(),
        serie: serie.trim().toUpperCase(),
        tarjeta_gasolina: tarjetaGasolina.trim().replace(/\s+/g, ''),
        base_nombre: baseNombre.trim(),
        km_inicial_ultimo: Number(kmInicial) || 0,
        rendimiento: Number(rendimiento) || 12.5,
        costo_litro: Number(costoLitro) || 23.99,
        email: perfil?.email,
        auth_id: perfil?.auth_id,
        updated_at: new Date().toISOString(),
      };

      // 1. Guardar local/backend
      try {
        await api('PATCH', '/api/ingenieros', payload);
      } catch (errApi) {
        console.warn('Sync API local fallback:', errApi.message);
      }

      // 2. Guardar en Supabase
      const { error: sbError } = await supabase
        .from('ingenieros')
        .upsert(payload, { onConflict: 'nombre' });

      if (sbError) {
        console.warn('Error Supabase ingenieros upsert:', sbError.message);
      }

      toast?.('Ficha vehicular guardada correctamente');
      onSaveSuccess?.(payload);
      onOpenChange(false);
    } catch (err) {
      console.error('[Error Guardando Ficha]:', err);
      setErrorMsg(err.message || 'Error al guardar ficha vehicular');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CarProfile weight="duotone" className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base sm:text-lg">
              {isOnboarding ? 'Configura tu Ficha Vehicular' : 'Mi Ficha Vehicular y Perfil'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {isOnboarding
              ? 'Para generar automáticamente tus bitácoras de gasolina (.xlsx) sin copiar ni pegar, necesitamos los datos de tu vehículo y tarjeta.'
              : 'Actualiza tu odómetro semanal, vehículo asignado o tarjeta para la emisión de tus bitácoras oficiales.'}
          </DialogDescription>
        </DialogHeader>

        {isOnboarding && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <WarningCircle weight="fill" className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <span className="font-semibold">Requisito operativo: </span>
              El sistema no permite generar ni descargar archivos de bitácora hasta que estos datos estén configurados.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <WarningCircle weight="fill" className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Nombre e Identificación */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <IdentificationBadge weight="duotone" className="h-4 w-4 text-primary" />
                Datos de Soporte Técnico
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {perfil?.nombre || 'Ingeniero'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">No. Empleado *</Label>
                <Input
                  value={noEmpleado}
                  onChange={(e) => setNoEmpleado(e.target.value)}
                  placeholder="Ej. 1221362"
                  className="text-xs font-mono h-9 bg-card"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Región Operativa *</Label>
                <Select value={region} onValueChange={handleRegionChange}>
                  <SelectTrigger className="text-xs h-9 bg-card font-medium">
                    <SelectValue placeholder="Región" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONES_SURESTE.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">CECO *</Label>
                <Input
                  value={ceco}
                  onChange={(e) => setCeco(e.target.value)}
                  placeholder="108266"
                  className="text-xs font-mono h-9 bg-card"
                  required
                />
              </div>

              <div className="space-y-1 sm:col-span-3">
                <Label className="text-[11px] font-medium flex items-center justify-between">
                  <span>Punto Base / Resguardo Operativo (Salida y Retorno) *</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Centra el mapa y calcula distancias
                  </span>
                </Label>
                <Select value={baseNombre} onValueChange={setBaseNombre}>
                  <SelectTrigger className="text-xs h-9 bg-card font-medium">
                    <SelectValue placeholder="Selecciona resguardo o tienda base" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {tiendasDeRegion.map((t) => (
                      <SelectItem key={t.nombre} value={t.nombre}>
                        {t.nombre} {t.zona ? `(${t.zona})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Ficha Vehicular y Combustible */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-3">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <CarProfile weight="duotone" className="h-4 w-4 text-primary" />
              Vehículo Asignado y Combustible
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">Modelo de Automóvil *</Label>
                <Input
                  value={automovil}
                  onChange={(e) => setAutomovil(e.target.value.toUpperCase())}
                  placeholder="Ej. AVEO"
                  className="text-xs uppercase h-9 bg-card"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Placas *</Label>
                <Input
                  value={placas}
                  onChange={(e) => setPlacas(e.target.value.toUpperCase())}
                  placeholder="Ej. PEB-798-C"
                  className="text-xs font-mono uppercase h-9 bg-card"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">No. Tarjeta Gasolina (16 dígitos) *</Label>
                <Input
                  value={tarjetaGasolina}
                  onChange={(e) => setTarjetaGasolina(e.target.value)}
                  placeholder="5064490100458236"
                  maxLength={19}
                  className="text-xs font-mono h-9 bg-card"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">No. Serie Vehicular (Opcional)</Label>
                <Input
                  value={serie}
                  onChange={(e) => setSerie(e.target.value.toUpperCase())}
                  placeholder="LZWPRMGN0TF108615"
                  className="text-xs font-mono uppercase h-9 bg-card"
                />
              </div>
            </div>

            {/* Parámetros Semanales de Odómetro y Rendimiento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <Speedometer weight="duotone" />
                  Odómetro Inicial (km)
                </Label>
                <Input
                  type="number"
                  value={kmInicial}
                  onChange={(e) => setKmInicial(e.target.value)}
                  placeholder="17374"
                  className="text-xs font-mono h-9 bg-card"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Actualizable cada semana
                </span>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Rendimiento (km / L)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={rendimiento}
                  onChange={(e) => setRendimiento(e.target.value)}
                  placeholder="12.5"
                  className="text-xs font-mono h-9 bg-card"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Estándar: 12.5 km/L
                </span>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Costo por Litro ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={costoLitro}
                  onChange={(e) => setCostoLitro(e.target.value)}
                  placeholder="23.99"
                  className="text-xs font-mono h-9 bg-card"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Precio oficial promedio
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            {isOnboarding ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Configurar después
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
            )}

            <Button
              type="submit"
              disabled={guardando}
              className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
            >
              <FloppyDiskBack weight="bold" className="h-3.5 w-3.5" />
              {guardando ? 'Guardando ficha…' : 'Guardar Ficha Vehicular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

