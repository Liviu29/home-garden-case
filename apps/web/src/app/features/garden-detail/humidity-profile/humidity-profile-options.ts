import type { Options, Point } from 'highcharts';
import { Garden, Plant } from '../../../core/api/models';
import {
  ATTENTION_HUMIDITY_DRIFT,
  plantHumidityDelta,
} from '../../../domain/garden-insights/garden-insights';
import { WateringZone, wateringZone } from '../../../domain/garden-planner/garden-planner';
import { ChartPalette, escapeLabel, withAlpha } from '../../../shared/ui/chart/chart-palette';

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

const ZONE_LABEL: Readonly<Record<WateringZone, string>> = {
  dry: 'Dry',
  balanced: 'Balanced',
  humid: 'Humid',
};

const round = (value: number, digits = 0): number => Number(value.toFixed(digits));
const signed = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(round(value))}`;
const plantOf = (point: Point): ProfilePlant => point.options.custom as ProfilePlant;

/** One sentence per plant, shared by the tooltip and by screen readers. */
export function describePlant(p: ProfilePlant): string {
  const delta = round(p.delta);
  const relation =
    delta === 0
      ? `right on the ${p.target}% target`
      : `${Math.abs(delta)} points ${delta > 0 ? 'above' : 'below'} the ${p.target}% target`;
  return (
    `${p.name}: wants ${p.humidity}% humidity, ${relation}; ` +
    `${p.area} m², ${round(p.share)}% of the garden; ${ZONE_LABEL[p.zone]} watering zone.`
  );
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
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    accessibility: {
      description:
        `Variwide column chart of the ${plants.length} plants in ${garden.gardenName}. Column ` +
        `height: the humidity each plant wants. Column width: the surface it takes. A line marks ` +
        `the garden's ${target}% target and a band the ±${tolerance} point tolerance.`,
      point: {
        descriptionFormatter: (point) =>
          `${describePlant(plantOf(point))} Selecting it finds the plant on the plan.`,
      },
    },
    xAxis: {
      type: 'category',
      lineColor: palette.grid,
      tickColor: palette.grid,
      title: { text: 'Column width = space the plant takes', style: axisText },
      labels: { rotation: -35, style: { ...axisText, textOverflow: 'ellipsis' } },
    },
    yAxis: {
      min: 0,
      max: 100,
      tickInterval: 25,
      gridLineColor: palette.grid,
      title: { text: 'Ideal humidity', style: axisText },
      labels: { format: '{value}%', style: axisText },
      plotBands: [
        {
          from: Math.max(0, target - tolerance),
          to: Math.min(100, target + tolerance),
          color: withAlpha(palette.brand, 0.09),
          label: {
            text: `Within ±${tolerance} of target`,
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
            text: `Garden target ${target}%`,
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
          `Wants ${p.humidity}% · ${signed(p.delta)} vs the ${p.target}% target<br/>` +
          `${p.area} m² · ${round(p.share)}% of the garden<br/>` +
          `${ZONE_LABEL[p.zone]} watering zone`
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
    series: [{ type: 'variwide', name: 'Plants', data }],
  };
}
