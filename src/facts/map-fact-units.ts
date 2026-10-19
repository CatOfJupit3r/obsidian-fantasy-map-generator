import type { FmgMapSettings } from '../map-data/fmg-map-data.schema';

/** FMG's own conversions from °C (`convertTemperature` in FMG's `utils/unitUtils.ts`). */
const TEMPERATURE_CONVERSIONS = new Map<string, (celsius: number) => number>([
  ['°C', (celsius) => celsius],
  ['°F', (celsius) => (celsius * 9) / 5 + 32],
  ['K', (celsius) => celsius + 273.15],
  ['°R', (celsius) => ((celsius + 273.15) * 9) / 5],
  ['°De', (celsius) => ((100 - celsius) * 3) / 2],
  ['°N', (celsius) => (celsius * 33) / 100],
  ['°Ré', (celsius) => (celsius * 4) / 5],
  ['°Rø', (celsius) => (celsius * 21) / 40 + 7.5],
]);
const CELSIUS = '°C';

/** FMG stores precipitation in hundreds of millimetres. */
const MILLIMETRES_PER_PRECIPITATION_UNIT = 100;

/** FMG's area unit setting holds this when the area is the square of the distance unit. */
const SQUARE_AREA_UNIT = 'square';

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Map values in the units the map's own settings name, as FMG shows them. */
export class MapFactUnits {
  public constructor(private readonly settings: FmgMapSettings) {}

  /** `rawArea` is in square map units. */
  public formatArea(rawArea: number): string {
    const area = rawArea * this.settings.distanceScale ** 2;
    const unit =
      this.settings.areaUnit === SQUARE_AREA_UNIT ? `${this.settings.distanceUnit}²` : this.settings.areaUnit;
    return `${NUMBER_FORMAT.format(area)} ${unit}`;
  }

  /** People from FMG's population points: rural points plus urban points, which count urbanization. */
  public readPeople(ruralPoints: number, urbanPoints: number): number {
    const { populationRate, urbanization } = this.settings;
    return Math.round(ruralPoints * populationRate + urbanPoints * populationRate * urbanization);
  }

  /** Like FMG's `si`: 840, 12.3K, 4M. */
  public formatPeople(people: number): string {
    if (people >= 1e9) return `${this.round(people / 1e9, 1)}B`;
    if (people >= 1e8) return `${Math.round(people / 1e6)}M`;
    if (people >= 1e6) return `${this.round(people / 1e6, 1)}M`;
    if (people >= 1e4) return `${Math.round(people / 1e3)}K`;
    if (people >= 1e3) return `${this.round(people / 1e3, 1)}K`;
    return String(Math.round(people));
  }

  public formatTemperature(celsius: number): string {
    const { temperatureScale } = this.settings;
    const convert = TEMPERATURE_CONVERSIONS.get(temperatureScale);
    // An unknown scale, say from a newer FMG, falls back to the °C FMG stores.
    if (!convert) return `${Math.round(celsius)}${CELSIUS}`;
    return `${Math.round(convert(celsius))}${temperatureScale}`;
  }

  public formatPrecipitation(precipitation: number): string {
    return `${NUMBER_FORMAT.format(precipitation * MILLIMETRES_PER_PRECIPITATION_UNIT)} mm`;
  }

  /** Two formatted values as one when they read the same, else as a range. */
  public formatRange(low: string, high: string): string {
    return low === high ? low : `${low} to ${high}`;
  }

  private round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
