import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

export type MeasurementKind=
  |"daylight"
  |"opening"
  |"frame"
  |"glass"
  |"inside"
  |"outside"
  |"net"
  |"gross"
  |"unspecified";

type Fact=OfficeCalculationContextSnapshot["context"]["facts"][number];

export function measurementKindLabel(kind:MeasurementKind):string{
  return({
    daylight:"dagmaat",
    opening:"sparingsmaat",
    frame:"kozijnmaat",
    glass:"glasmaat",
    inside:"binnenwerks",
    outside:"buitenwerks",
    net:"nettomaat",
    gross:"brutomaat",
    unspecified:"maatsoort onbekend"
  } as Record<MeasurementKind,string>)[kind];
}

export function measurementKindForFact(fact:Fact):MeasurementKind{
  const explicit=String(fact.measurement_kind??"").trim().toLocaleLowerCase("nl-NL");
  const aliases:Record<string,MeasurementKind>={
    daylight:"daylight",dagmaat:"daylight",daylight_dimension:"daylight",
    opening:"opening",opening_dimension:"opening",sparingsmaat:"opening",sparing:"opening",
    frame:"frame",frame_dimension:"frame",kozijnmaat:"frame",kozijn:"frame",
    glass:"glass",glass_dimension:"glass",glasmaat:"glass",
    inside:"inside",inside_dimension:"inside",binnenwerks:"inside",
    outside:"outside",outside_dimension:"outside",buitenwerks:"outside",
    net:"net",netto:"net",nettomaat:"net",
    gross:"gross",bruto:"gross",brutomaat:"gross"
  };
  if(explicit&&aliases[explicit])return aliases[explicit];

  const haystack=[
    fact.value_text??"",
    fact.source_fragment??"",
    fact.extraction_method??"",
    fact.measurement_reference??""
  ].join(" ").toLocaleLowerCase("nl-NL");

  if(/dagmaat|dagopening|vrije opening/.test(haystack))return"daylight";
  if(/sparingsmaat|sparing|ruwbouwmaat|opening.?maat/.test(haystack))return"opening";
  if(/kozijnmaat|kozijn.?buitenmaat|frame.?maat/.test(haystack))return"frame";
  if(/glasmaat|ruitmaat|glas.?maat/.test(haystack))return"glass";
  if(/binnenwerks|inwendig/.test(haystack))return"inside";
  if(/buitenwerks|uitwendig/.test(haystack))return"outside";
  if(/netto.?maat|nettomaat/.test(haystack))return"net";
  if(/bruto.?maat|brutomaat/.test(haystack))return"gross";
  return"unspecified";
}

export function geometryKeyForFact(fact:Fact):string{
  return measurementKindForFact(fact);
}
