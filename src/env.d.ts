// Hand-written env type augmentation that SURVIVES `wrangler types`.
//
// `wrangler types` regenerates worker-configuration.d.ts from wrangler.jsonc and
// infers each `vars` entry as the LITERAL of its configured value — so
// KEY_SELECTION_STRATEGY would be typed as the single literal "hash", making the
// runtime comparison `env.KEY_SELECTION_STRATEGY === 'hrw'` a "no overlap" type
// error. This module-augmentation widens it to the real opt-in union so the
// branch typechecks while the configured default stays "hash".
//
// Keep this in sync with keySelectionStrategy() in src/api.ts.
declare namespace Cloudflare {
    interface Env {
        // 'hash' (DEFAULT) — legacy hash%len consistent hashing.
        // 'hrw'            — rendezvous/highest-random-weight, churn-stable (opt-in).
        // Any other/absent value is coerced to 'hash' at runtime.
        KEY_SELECTION_STRATEGY?: 'hash' | 'hrw'
    }
}
