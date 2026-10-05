class LegacySensor {
  readRaw() { return { tenths: 237, quality: "good" }; }
}
class SensorAdapter {
  constructor(source) { this.source = source; }
  sample() { const raw = this.source.readRaw(); return { temperature: raw.tenths / 10, valid: raw.quality === "good" }; }
}
const sensor = new SensorAdapter(new LegacySensor());
const sample = sensor.sample();
console.log(JSON.stringify([sample, sample.valid && sample.temperature > 20]));
