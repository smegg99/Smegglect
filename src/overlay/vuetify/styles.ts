// src/overlay/vuetify/styles.ts
// The Vuetify the overlay renders, made for the shadow root: its reset, the stylesheets of the components the
// overlay uses (VBtn, VIcon, VSwitch and what they import, as Vuetify's own modules list them), and S99AB's.
// The overlay's own sheets come after them. Vuetify's whole stylesheet is 537 KB; this is about 60 KB.

import s99ab from '@smegg99/s99ab/styles?inline'
import btn from 'vuetify/lib/components/VBtn/VBtn.css?inline'
import btnGroup from 'vuetify/lib/components/VBtnGroup/VBtnGroup.css?inline'
import btnToggle from 'vuetify/lib/components/VBtnToggle/VBtnToggle.css?inline'
import icon from 'vuetify/lib/components/VIcon/VIcon.css?inline'
import input from 'vuetify/lib/components/VInput/VInput.css?inline'
import messages from 'vuetify/lib/components/VMessages/VMessages.css?inline'
import selection from 'vuetify/lib/components/VSelectionControl/VSelectionControl.css?inline'
import selectionGroup from 'vuetify/lib/components/VSelectionControlGroup/VSelectionControlGroup.css?inline'
import switches from 'vuetify/lib/components/VSwitch/VSwitch.css?inline'
import ripple from 'vuetify/lib/directives/ripple/VRipple.css?inline'
import core from 'vuetify/lib/styles/core.css?inline'
import { forShadow, layerOrder } from './shadow-css'

/** The one Vuetify utility class the overlay's components set, in Vuetify's own layer for it. */
const UTILITIES = '@layer vuetify-utilities.helpers { .elevation-0 { box-shadow: none; } }'

const VUETIFY = [
  core, ripple, btn, btnGroup, btnToggle, icon, input, messages, selection, selectionGroup, switches,
  UTILITIES,
].join('\n')

export const KIT_STYLES: readonly string[] = [forShadow(VUETIFY), forShadow(s99ab)]

/** Written first in the theme stylesheet; see layerOrder. */
export const LAYER_ORDER = layerOrder(core)
