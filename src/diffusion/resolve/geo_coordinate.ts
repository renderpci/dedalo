/**
 * The publication path's handle on THE geo-coordinate law. FACADE ONLY — zero
 * logic lives here, so there is one law, not two.
 *
 * The law (parse + range + why the range is an input-door rule and not a
 * publication one) is src/core/concepts/geo_coordinate.ts. Import it there for
 * anything new; this alias exists because the three publication paths and
 * scripts/repair_geolocation_studio_default.ts already reach for this path.
 */

export {
	type CoordinateAxis,
	hasCoordinate,
	isCoordinateInRange,
	isStudioDefault,
	parseCoordinate,
	toCoordinate,
} from '../../core/concepts/geo_coordinate.ts';
