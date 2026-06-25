# Trader and Risk Atlas API

Last updated: 2026-06-21

## Scope

The shared Radiant-MVT backend now exposes map-ready Atlas feeds for the Trader and Risk shells.

Visible screens:

- Trader: `MVT Atlas` at `http://127.0.0.1:8006/#atlas`
- Risk: `Risk Atlas` at `http://127.0.0.1:8007/#risk-atlas`

The current data state is mixed. Positions, trades, market prices, and vessels are read from the local Trader database when available. Spatial mapping, route geometry, some hub mappings, basis connectors, reconciliation facts, and AI anomaly pins are demo-backed and labeled with `is_demo`.

## Endpoints

All Atlas endpoints are mounted under `http://127.0.0.1:8005/api/atlas` and follow the existing bearer-token auth pattern.

- `GET /summary`
- `GET /nodes`
- `GET /routes`
- `GET /layers`
- `GET /layers/{layer_key}`
- `GET /lineage/{object_type}/{object_id}`
- `GET /risk/var-heat`
- `GET /risk/basis-volatility`
- `POST /risk/scenario-overlay`
- `GET /trades/deal-pins`
- `GET /positions/hubs`
- `GET /pricing/hubs`
- `GET /anomalies`

## Feature Coverage

- F-01 Deal origination pins: trade records are shown as location pins with demo-backed receipt/delivery geocoding.
- F-03 Deal-to-physical thread: selected deal pins expose inferred physical route context.
- F-06 Transport mode layers: marine, pipeline, rail, and truck routes are available as layer-controlled map objects.
- F-07 Demurrage / laytime dwell rings: vessel delay/demurrage records render as pulsing alert markers where vessel coordinates exist.
- F-14 Net length / short by hub: position records aggregate to hub nodes with long/short direction and magnitude.
- F-16 Open delivery-obligation exposure: terminal nodes show receive/deliver quantities.
- F-17 Position concentration heat: position hub sizing and concentration score are exposed in detail.
- F-18 VaR / price exposure heat: Risk Atlas displays regional VaR heat circles.
- F-19 Basis-risk volatility connectors: hub-to-hub basis-vol connectors render on the map and in the Risk list.
- F-20 Scenario overlay recolor: Risk Atlas can apply scenario overlays and recolor impacted objects.
- F-24 Index hub nodes + forward curve: pricing hubs include mini forward-curve arrays in detail.
- F-25 Basis differential connectors: basis spread connectors are available as route objects.
- F-26 Unpriced volume geographic flag: deal pins expose `unpriced_volume_flag`.
- F-43 Reconciliation status: nodes/routes include basic reconciled/watch/break states.
- F-44 Data lineage on click: the detail drawer calls `/lineage/{object_type}/{object_id}`.
- F-45 AI anomaly pins: demo-backed anomaly pins render as selectable AI objects.

## Response Shape

Atlas objects use this shared shape:

```json
{
  "id": "string",
  "feature_id": "F-18",
  "layer_key": "risk",
  "object_type": "node|route|pin|hub|region|heat|anomaly",
  "name": "string",
  "lat": 0,
  "lon": 0,
  "geometry": {"type": "LineString", "coordinates": [[0, 0]]},
  "metric": 0,
  "unit": "string",
  "status": "ok|watch|breach|unknown",
  "severity": "low|medium|high",
  "source_system": "string",
  "source_timestamp": "ISO-8601",
  "is_demo": true,
  "detail": {}
}
```

## Remaining Real Data Gaps

- Trade receipt and delivery latitude/longitude are not first-class fields, so deal pins use demo geocoding.
- Physical route nominations are inferred rather than linked to a canonical movement table.
- Pipeline, rail, truck, basis connector, and scenario geometries are demo-backed.
- Reconciliation and lineage are generated from local source metadata plus demo trust records.
- External Segmented P&L and Credit Atlas feeds are not required for startup and are not yet consumed here.
