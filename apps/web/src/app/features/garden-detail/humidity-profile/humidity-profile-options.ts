import type { Options, Point } from 'highcharts';
import type { Garden, Plant } from '../../../core/api/models';
import { plantsCount, pointsCount } from '../../../core/i18n/plurals';
import {
  ATTENTION_HUMIDITY_DRIFT,
  plantHumidityDelta,
} from '../../../domain/garden-insights/garden-insights';
import { type WateringZone, wateringZone } from '../../../domain/garden-planner/garden-planner';
import { type ChartPalette, escapeLabel, withAlpha } from '../../../shared/ui/chart/chart-palette';
import { WATERING_ZONE_LABEL } from '../../../shared/ui/watering-zone/watering-zone-labels';

/** What the chart knows about one plant — carried on its point for tooltips and events. */
export interface ProfilePlant {
  readonly plantId: number;
  readonly name: string;
  readonly humidity: number;
  readonly area: number;
  /** Ideal humidity minus the garden's target, in points. */
  readonly delta: number;
  /** Share of the garden's surface, in %. */
  readonly share: number;
  readonly zone: WateringZone;
  readonly target: number;
}

const round = (value: number, digits = 0): number => Number(value.toFixed(digits));
/** Sign of the ROUNDED value, so a 0.3-point drift reads "±0", never "+0". */
const signed = (value: number): string => {
  const whole = round(value);
  return `${whole > 0 ? '+' : whole < 0 ? '−' : '±'}${Math.abs(whole)}`;
};
const plantOf = (point: Point): ProfilePlant => point.options.custom as ProfilePlant;

/** One sentence per plant, shared by the tooltip and by screen readers. */
export function describePlant(p: ProfilePlant): string {
  const delta = round(p.delta);
  const points = Math.abs(delta);
  const relation =
    delta === 0
      ? $localize`right on the ${p.target}:target:% target`
      : delta > 0
        ? $localize`${pointsCount(points)}:points: above the ${p.target}:target:% target`
        : $localize`${pointsCount(points)}:points: below the ${p.target}:target:% target`;
  return $localize`${p.name}:plantName:: wants ${p.humidity}:humidity:% humidity, ${relation}:relation:; ${p.area}:area: m², ${round(p.share)}:share:% of the garden; ${WATERING_ZONE_LABEL[p.zone]}:zone: watering zone.`;
}

/**
 * The humidity profile: one column per plant, as wide as the space it takes
 * and as tall as the humidity it wants, coloured by the planner's watering
 * zone. A line marks the garden's target and a band the tolerance the
 * dashboard allows before it flags drift. Choosing a column finds the plant
 * on the plan.
 */
export function humidityProfileOptions(
  garden: Garden,
  plants: readonly Plant[],
  selectedPlantId: number | null,
  palette: ChartPalette,
  onSelect: (plantId: number) => void,
): Options {
  const target = garden.targetHumidityLevel;
  const tolerance = ATTENTION_HUMIDITY_DRIFT;
  const zoneColor: Readonly<Record<WateringZone, string>> = {
    dry: palette.dry,
    balanced: palette.balanced,
    humid: palette.humid,
  };
  const axisText = { color: palette.muted, fontSize: '12px' };

  const data = [...plants]
    .sort(
      (a, b) =>
        a.idealHumidityLevel - b.idealHumidityLevel || a.plantName.localeCompare(b.plantName),
    )
    .map((plant) => {
      const custom: ProfilePlant = {
        plantId: plant.plantId,
        name: plant.plantName,
        humidity: plant.idealHumidityLevel,
        area: plant.surfaceAreaRequired,
        delta: plantHumidityDelta(garden, plant),
        share:
          garden.totalSurfaceArea > 0
            ? (plant.surfaceAreaRequired / garden.totalSurfaceArea) * 100
            : 0,
        zone: wateringZone(plant.idealHumidityLevel),
        target,
      };
      const selected = plant.plantId === selectedPlantId;
      return {
        name: plant.plantName,
        y: plant.idealHumidityLevel,
        z: plant.surfaceAreaRequired,
        color: zoneColor[custom.zone],
        borderColor: selected ? palette.text : palette.surface,
        borderWidth: selected ? 3 : 1,
        custom,
      };
    });

  return {
    chart: {
      type: 'variwide',
      backgroundColor: 'transparent',
      spacing: [12, 8, 8, 8],
      style: { fontFamily: 'inherit' },
    },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: false },
    accessibility: {
      description: $localize`Variwide column chart of ${plantsCount(plants.length)}:plants: in ${garden.gardenName}:gardenName:. Column height: the humidity each plant wants. Column width: the surface it takes. A line marks the garden's ${target}:target:% target and a band the ±${tolerance}:tolerance: point tolerance.`,
      point: {
        descriptionFormatter: (point) =>
          $localize`${describePlant(plantOf(point))}:description: Selecting it finds the plant on the plan.`,
      },
    },
    xAxis: {
      type: 'category',
      lineColor: palette.grid,
      tickColor: palette.grid,
      title: { text: $localize`Column width = space the plant takes`, style: axisText },
      labels: { rotation: -35, style: { ...axisText, textOverflow: 'ellipsis' } },
    },
    yAxis: {
      min: 0,
      max: 100,
      tickInterval: 25,
      gridLineColor: palette.grid,
      title: { text: $localize`Ideal humidity`, style: axisText },
      labels: { format: '{value}%', style: axisText },
      plotBands: [
        {
          from: Math.max(0, target - tolerance),
          to: Math.min(100, target + tolerance),
          color: withAlpha(palette.brand, 0.09),
          label: {
            text: $localize`Within ±${tolerance}:tolerance: of target`,
            align: 'right',
            x: -6,
            style: { color: palette.faint, fontSize: '11px', fontWeight: '600' },
          },
        },
      ],
      plotLines: [
        {
          value: target,
          color: palette.text,
          width: 2,
          dashStyle: 'Dash',
          zIndex: 5,
          label: {
            text: $localize`Garden target ${target}:target:%`,
            align: 'left',
            x: 4,
            y: -6,
            style: { color: palette.text, fontSize: '11px', fontWeight: '600' },
          },
        },
      ],
    },
    tooltip: {
      backgroundColor: palette.surface,
      borderColor: palette.grid,
      style: { color: palette.text, fontSize: '12px' },
      headerFormat: '',
      pointFormatter: function (this: Point) {
        const p = plantOf(this);
        return (
          `<b>${escapeLabel(p.name)}</b><br/>` +
          $localize`Wants ${p.humidity}:humidity:% · ${signed(p.delta)}:delta: vs the ${p.target}:target:% target` +
          '<br/>' +
          $localize`${p.area}:area: m² · ${round(p.share)}:share:% of the garden` +
          '<br/>' +
          $localize`${WATERING_ZONE_LABEL[p.zone]}:zone: watering zone`
        );
      },
    },
    plotOptions: {
      variwide: {
        borderRadius: 3,
        cursor: 'pointer',
        point: {
          events: {
            click: function (this: Point) {
              onSelect(plantOf(this).plantId);
            },
          },
        },
      },
    },
    series: [{ type: 'variwide', name: $localize`Plants`, data }],
  };
}
