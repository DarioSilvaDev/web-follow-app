/**
 * Frontend feature flags for capabilities whose backend contract is not yet
 * deployed.
 *
 * `VIN_CORRECTION_ENABLED` gates the "Corregir VIN" action on the edit page.
 * The backend command `POST /vehicles/:id/vin-correction` (D-03, design §10
 * step 9) is still NOT implemented (Bloque B). Until it ships, the UI must
 * not expose an action that would call a non-existent endpoint, so the flag
 * defaults to `false`. The client method (`vehicleApi.correctVin`) is ready
 * and typed; flipping this flag is the only change needed once the endpoint
 * is live.
 */
export const VIN_CORRECTION_ENABLED = false;
