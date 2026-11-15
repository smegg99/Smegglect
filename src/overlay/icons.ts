// src/overlay/icons.ts
// MDI path data (Apache-2.0), the icon language of the reference apps. Only these are bundled.

import {
  mdiClockOutline,
  mdiProgressWrench,
  mdiInboxArrowDown,
  mdiProgressCheck,
  mdiAlertCircleOutline,
  mdiPauseCircleOutline,
  mdiEarHearing,
  mdiEarHearingOff,
  mdiLinkVariant,
  mdiLinkVariantOff,
  mdiCropFree,
  mdiPageLayoutSidebarRight,
  mdiCursorMove,
  mdiSquareRoundedOutline,
  mdiToggleSwitchOutline,
  mdiPuzzleOutline,
  mdiApplicationArrayOutline,
  mdiCheckboxIntermediate,
  mdiEyeOffOutline,
  mdiNavigationVariantOutline,
  mdiAnimationPlayOutline,
  mdiBroom,
  mdiEraser,
  mdiArrowLeft,
  mdiCogOutline,
  mdiApplicationExport,
  mdiApplicationImport,
  mdiGestureTap,
  mdiArrowExpandRight,
  mdiSpellcheck,
  mdiWrap,
  mdiPaletteOutline,
  mdiShapeOutline,
  mdiCursorDefaultClickOutline,
  mdiKeyboardOutline,
  mdiTagTextOutline,
  mdiMonitorCellphone,
  mdiBorderInside,
  mdiBorderOutside,
  mdiCrosshairsGps,
  mdiEyeOutline,
  mdiFileDocumentCheckOutline,
  mdiHistory,
  mdiOpenInNew,
  mdiRoundedCorner,
  mdiRuler,
  mdiAlignHorizontalCenter,
  mdiAlignHorizontalLeft,
  mdiArrowCollapseDown,
  mdiArrowCollapseHorizontal,
  mdiArrowExpandHorizontal,
  mdiArrowExpandVertical,
  mdiArrowUpLeft,
  mdiCheck,
  mdiChevronRight,
  mdiClose,
  mdiContentCopy,
  mdiCursorDefaultOutline,
  mdiDistributeHorizontalCenter,
  mdiDockBottom,
  mdiDockLeft,
  mdiDockRight,
  mdiDockTop,
  mdiDotsHorizontal,
  mdiFormatListChecks,
  mdiFormatSize,
  mdiFormatTextWrappingClip,
  mdiGestureTapButton,
  mdiImagePlusOutline,
  mdiNoteTextOutline,
  mdiPaletteSwatchOutline,
  mdiResize,
  mdiRulerSquare,
  mdiSelectGroup,
  mdiSelectionDrag,
  mdiStarOutline,
  mdiTrashCanOutline,
  mdiTrayArrowDown,
  mdiRedo,
  mdiUndo,
  mdiVectorIntersection,
  mdiViewQuiltOutline,
} from '@mdi/js'

/** The button while the overlay is folded: a cat's paw, from assets/cat-paw-01-closed.svg. */
const pawClosed = 'M11.1721 21.9905 C8.9356 21.8544 7.4029 21.2588 6.4932 20.1723 '
  + 'C6.2071 19.8306 5.9978 19.4504 '
  + '5.2773 17.9641 C4.7121 16.7981 4.6747 16.7325 4.3351 16.3122 C3.7542 15.5933 3.4518 15.0436 '
  + '3.2475 14.3354 C2.8044 12.7996 3.2835 10.988 4.438 9.8335 C4.8157 9.4559 5.3739 9.0692 5.837 '
  + '8.8643 C6.1234 8.7376 6.2305 8.6352 6.5248 8.2064 C7.4312 6.8854 8.6094 6.1829 10.1533 6.0428 '
  + 'C10.5924 6.0029 11.2498 6.0476 11.7677 6.1524 C12.0708 6.2138 12.0998 6.2137 12.3884 6.151 '
  + 'C13.5717 5.8937 14.7789 6.0273 15.8031 6.529 C16.2602 6.753 16.6028 7.0042 16.9886 7.3984 '
  + 'C17.2691 7.685 17.3893 7.845 17.8027 8.482 C17.9536 8.7145 18.0093 8.7678 18.2045 8.8664 '
  + 'C19.6696 9.606 20.5255 10.7059 20.8663 12.2873 C20.9408 12.633 20.9289 13.6264 20.8457 14.0101 '
  + 'C20.6579 14.8757 20.304 15.5576 19.6289 16.3543 C19.3362 16.6997 19.3254 16.7191 18.6455 18.1224 '
  + 'C17.9549 19.5477 17.8422 19.7585 17.5969 20.084 C16.8592 21.063 15.5345 21.6942 13.7443 21.9196 '
  + 'C13.3038 21.9751 11.662 22.0204 11.1721 21.9905 Z M9.8384 18.7987 C10.0421 18.7162 10.3422 '
  + '18.5896 10.5052 18.5173 C10.6682 18.4449 10.9517 18.3399 11.135 18.2838 C11.443 18.1897 11.5166 '
  + '18.1819 12.0983 18.1819 C12.6802 18.1819 12.7535 18.1896 13.0615 18.2839 C13.2449 18.34 13.545 '
  + '18.4534 13.7284 18.5359 C14.6224 18.9379 14.6668 18.9522 15.0251 18.9542 C15.3236 18.9558 '
  + '15.3837 18.9439 15.5993 18.841 C16.1712 18.5681 16.5602 17.9169 16.562 17.2295 L16.5626 17.022 '
  + '16.7571 17.0548 C17.296 17.1457 18.3067 16.8547 18.7114 16.4922 C18.8569 16.3618 18.8768 16.361 '
  + '18.3409 16.5057 C17.2815 16.7916 16.4984 16.6693 16.0124 16.142 C15.5674 15.6593 15.4847 15.0077 '
  + '15.763 14.1768 C16.0166 13.4196 16.4557 12.7348 17.2772 11.815 C17.5665 11.4911 17.5418 11.4498 '
  + '17.1839 11.6596 C16.2803 12.1891 15.505 13.1756 15.2117 14.1688 L15.1075 14.5217 14.8237 14.5632 '
  + 'C13.7288 14.7233 12.5429 13.9229 12.1654 12.769 C12.0808 12.5104 12.0682 12.4088 12.0667 11.9724 '
  + 'C12.0651 11.5274 12.0779 11.4222 12.1825 11.0181 C12.3269 10.4599 12.4213 10.2181 12.7704 9.5121 '
  + 'C12.9207 9.2083 13.0337 8.9499 13.0216 8.9379 C12.9839 8.9002 12.4213 9.5124 12.2512 9.7761 '
  + 'C11.8918 10.3334 11.6457 10.9683 11.5593 11.5612 C11.4742 12.1445 11.5783 12.902 11.805 13.3494 '
  + 'L11.8974 13.5316 11.8249 13.6319 C11.5094 14.069 10.8394 14.4554 10.2034 14.5669 C9.9154 14.6174 '
  + '9.3362 14.5984 9.1114 14.531 C8.9846 14.493 8.9758 14.4801 8.9519 14.2967 C8.9135 14.002 8.6879 '
  + '13.3623 8.498 13.0098 C8.2442 12.5384 7.9854 12.1806 7.6249 11.8028 C7.3206 11.4839 6.7653 '
  + '11.0505 6.7195 11.0962 C6.7082 11.1076 6.856 11.3302 7.0479 11.591 C7.4811 12.1794 7.7241 '
  + '12.5611 7.9394 12.9912 C8.3294 13.7703 8.51 14.4515 8.4749 15.0104 C8.4499 15.4092 8.3754 '
  + '15.6497 8.1916 15.925 C7.7272 16.6204 6.7541 16.8432 5.6603 16.5047 C5.4927 16.4528 5.3139 '
  + '16.4027 5.2629 16.3934 C5.1713 16.3766 5.1715 16.3774 5.2815 16.4726 C5.4419 16.6114 5.8755 '
  + '16.8447 6.1338 16.9311 C6.4988 17.0534 6.9594 17.1029 7.2926 17.0558 C7.4506 17.0335 7.606 '
  + '17.0052 7.6378 16.9929 C7.6876 16.9738 7.6959 17.0165 7.697 17.2965 C7.6991 17.8283 7.8963 '
  + '18.2889 8.2588 18.6083 C8.7239 19.0181 9.1648 19.0713 9.8384 18.7987 Z'

/** The button while the overlay is open: the paw with its toes spread, from assets/cat-paw-01-open.svg. */
const pawOpen = 'M10.9465 21.9787 C9.9515 21.914 8.8746 21.7252 8.1991 21.4971 '
  + 'C7.8535 21.3803 7.3222 21.1243 '
  + '7.0202 20.9289 C6.6737 20.7047 6.1836 20.2165 5.9659 19.8787 C5.8706 19.7307 5.5625 19.1221 '
  + '5.2814 18.5264 C4.3623 16.5792 4.3022 16.4754 3.6671 15.7391 C3.4385 15.4742 3.1722 15.1491 '
  + '3.0753 15.0167 C1.9979 13.5449 1.7133 11.8629 2.2978 10.4227 C2.4338 10.0878 2.7046 9.6419 '
  + '2.9162 9.4044 L3.0945 9.2043 3.0147 8.9707 C2.9043 8.6476 2.8796 8.1433 2.9588 7.8294 C3.038 '
  + '7.5151 3.2231 7.1386 3.3341 7.0658 C3.4762 6.9728 3.5484 7.0294 3.7054 7.357 C3.8238 7.6039 '
  + '3.9191 7.7311 4.2038 8.0221 L4.5557 8.3819 4.778 8.3431 C5.0796 8.2905 5.4843 8.3284 5.8179 '
  + '8.4404 C5.9702 8.4915 6.1019 8.5333 6.1105 8.5333 C6.1192 8.5333 6.092 8.4374 6.0502 8.3203 '
  + 'C5.954 8.051 5.918 7.4399 5.9792 7.1164 C6.0795 6.5857 6.2936 6.0872 6.5909 5.6917 C6.8073 '
  + '5.4038 7.2302 5.0099 7.4889 4.8551 L7.6863 4.7371 7.6867 4.4586 C7.6875 3.949 7.8765 3.4684 '
  + '8.2235 3.0936 C8.4603 2.8379 8.6157 2.7381 8.7236 2.7723 C8.8071 2.7988 8.8194 2.8351 8.8685 '
  + '3.1984 C8.9325 3.6725 9.2265 4.3839 9.3585 4.3839 C9.5205 4.3839 10.0174 4.5082 10.2495 4.6068 '
  + 'C10.6059 4.7582 10.8895 4.9502 11.2006 5.2506 C11.543 5.5812 11.7751 5.9034 11.9183 6.2468 '
  + 'C11.9797 6.3938 12.0352 6.5202 12.0417 6.5274 C12.0482 6.5347 12.104 6.4294 12.1657 6.2934 '
  + 'C12.4953 5.5665 13.1355 4.9294 13.8601 4.6073 C14.0655 4.516 14.5819 4.3846 14.7369 4.3842 '
  + 'C14.8325 4.3839 14.8561 4.3525 15.0224 4.0042 C15.2025 3.6269 15.3166 3.2492 15.3176 3.0265 '
  + 'C15.3184 2.8692 15.4279 2.7366 15.5302 2.7691 C15.7363 2.8345 16.0823 3.2098 16.2584 3.559 '
  + 'C16.3984 3.8367 16.4664 4.1331 16.4684 4.4751 L16.4702 4.7729 16.6777 4.9026 C16.9527 5.0745 '
  + '17.3801 5.4946 17.575 5.7847 C17.9678 6.3694 18.1453 6.9242 18.1461 7.5701 C18.1466 7.9289 '
  + '18.1321 8.0385 18.0541 8.2647 C18.0033 8.4124 17.9667 8.5333 17.9728 8.5333 C17.979 8.5333 '
  + '18.1128 8.4901 18.2702 8.4373 C18.6014 8.3261 18.995 8.2875 19.2732 8.339 L19.468 8.3751 19.8116 '
  + '8.0374 C20.0945 7.7594 20.1864 7.6392 20.3318 7.357 C20.5236 6.9848 20.584 6.9455 20.7304 7.0977 '
  + 'C20.8545 7.2268 21.0191 7.6042 21.0833 7.907 C21.1552 8.2459 21.1367 8.5701 21.0239 8.9501 '
  + 'L20.939 9.2361 21.0844 9.3941 C21.9014 10.2817 22.2084 11.7526 21.8553 13.087 C21.6061 14.0289 '
  + '21.1562 14.8001 20.2755 15.7953 C19.6677 16.4821 19.5907 16.6108 18.8223 18.2227 C18.0347 19.875 '
  + '17.8619 20.1574 17.3561 20.6191 C16.5781 21.3291 15.35 21.7517 13.5028 21.9451 C12.9799 21.9998 '
  + '11.5593 22.0185 10.9465 21.9787 Z M9.6498 18.8785 C9.823 18.8158 10.1724 18.6788 10.4262 18.5741 '
  + 'C11.1767 18.2644 11.3617 18.2225 11.9838 18.2219 C12.6314 18.2212 12.8734 18.2776 13.6449 18.609 '
  + 'C14.5761 19.009 15.069 19.098 15.5945 18.9611 C16.2697 18.7853 16.8562 18.1836 17.0398 17.4784 '
  + 'C17.2522 16.6631 16.8973 15.732 16.1332 15.1 C15.4275 14.5161 15.2191 14.3151 14.8316 13.8441 '
  + 'C14.0825 12.9336 13.8121 12.6865 13.2984 12.4427 C12.3617 11.9982 11.3681 12.0444 10.5114 '
  + '12.5722 C10.109 12.82 9.8484 13.0666 9.279 13.738 C8.7819 14.3242 8.5847 14.5224 8.0313 14.9923 '
  + 'C7.3285 15.5892 7.0044 16.1418 6.9272 16.8748 C6.8622 17.4936 7.2023 18.2301 7.7414 18.6374 '
  + 'C8.1377 18.9369 8.411 19.0201 8.9459 19.0041 C9.2686 18.9945 9.3886 18.9731 9.6498 18.8785 Z '
  + 'M6.5921 14.1819 C6.9129 14.0983 7.1459 13.9564 7.3889 13.6967 C7.9787 13.0661 7.9729 12.0476 '
  + '7.3742 11.1479 C6.6603 10.0749 5.2745 9.6753 4.4455 10.3034 C3.8549 10.7508 3.6395 11.5281 '
  + '3.8735 12.3678 C3.8962 12.4493 3.9896 12.6614 4.081 12.8391 C4.4356 13.5284 5.0974 14.0528 '
  + '5.8154 14.2135 C5.9845 14.2514 6.3885 14.2349 6.5921 14.1819 Z M18.3148 14.1818 C18.7279 14.0844 '
  + '19.1128 13.8558 19.4736 13.4936 C19.7472 13.2188 19.8223 13.1147 19.9827 12.788 C20.2341 12.2758 '
  + '20.3149 11.8749 20.2528 11.4485 C20.1683 10.8689 19.8381 10.3887 19.3635 10.155 C19.1587 10.0542 '
  + '19.0729 10.0345 18.7838 10.0218 C18.3562 10.0031 18.0951 10.0571 17.7339 10.239 C17.1784 10.5186 '
  + '16.7815 10.9287 16.4983 11.5157 C15.7589 13.0485 16.7779 14.5441 18.3148 14.1818 Z M10.1022 '
  + '10.4893 C10.6207 10.2431 11.0145 9.7245 11.1675 9.0866 C11.3079 8.5006 11.2457 8.0013 10.96 '
  + '7.4227 C10.6544 6.8034 10.079 6.3197 9.5009 6.1957 C8.5469 5.9911 7.5969 6.7785 7.4274 7.9143 '
  + 'C7.373 8.279 7.4059 8.6074 7.5387 9.0253 C7.7851 9.8004 8.3521 10.402 9.0167 10.5936 C9.115 '
  + '10.622 9.3205 10.6385 9.5039 10.6328 C9.7799 10.6242 9.8574 10.6056 10.1022 10.4893 Z M15.0388 '
  + '10.5883 C15.8513 10.3767 16.5255 9.5538 16.6888 8.5742 C16.8804 7.4255 16.0963 6.2496 15.0879 '
  + '6.1734 C14.5257 6.1308 14.0819 6.3158 13.6121 6.7883 C12.9923 7.4119 12.7294 8.222 12.8891 '
  + '9.0166 C13.1188 10.1597 14.0553 10.8445 15.0388 10.5883 Z'

/** Claude's crab from assets/smegglect.svg (16 x 10 there), 1.5 times larger and centred; eyes are holes. */
const crab = 'M 3 4.5 L 21 4.5 L 21 10.5 L 24 10.5 L 24 13.5 L 21 13.5 L 21 16.5 L 19.5 16.5 L 19.5 19.5 L '
  + '18 19.5 L 18 16.5 L 16.5 16.5 L 16.5 19.5 L 15 19.5 L 15 16.5 L 9 16.5 L 9 19.5 L 7.5 19.5 L '
  + '7.5 16.5 L 6 16.5 L 6 19.5 L 4.5 19.5 L 4.5 16.5 L 3 16.5 L 3 13.5 L 0 13.5 L 0 10.5 L 3 '
  + '10.5 Z M 6 7.5 H 7.5 V 10.5 H 6 Z M 16.5 7.5 H 18 V 10.5 H 16.5 Z'

export const ICONS = {
  pawClosed,
  pawOpen,
  crab,
  listening: mdiEarHearing,
  nobody: mdiEarHearingOff,
  away: mdiClockOutline,
  working: mdiProgressWrench,
  taken: mdiInboxArrowDown,
  partial: mdiProgressCheck,
  blocked: mdiAlertCircleOutline,
  stalled: mdiPauseCircleOutline,
  linked: mdiLinkVariant,
  unlinked: mdiLinkVariantOff,
  edgeRoom: mdiCropFree,
  scrollbar: mdiPageLayoutSidebarRight,
  placement: mdiCursorMove,
  shape: mdiSquareRoundedOutline,
  control: mdiToggleSwitchOutline,
  designSystem: mdiPuzzleOutline,
  likeApp: mdiApplicationArrayOutline,
  wrongState: mdiCheckboxIntermediate,
  visibility: mdiEyeOffOutline,
  jumps: mdiNavigationVariantOutline,
  motion: mdiAnimationPlayOutline,
  simplify: mdiBroom,
  removeIt: mdiEraser,
  pick: mdiCursorDefaultOutline,
  region: mdiSelectionDrag,
  measure: mdiRulerSquare,
  issues: mdiFormatListChecks,
  more: mdiDotsHorizontal,
  settings: mdiCogOutline,
  size: mdiResize,
  spacing: mdiArrowCollapseHorizontal,
  align: mdiAlignHorizontalLeft,
  alignCenterX: mdiAlignHorizontalCenter,
  matchHeight: mdiArrowExpandVertical,
  matchWidth: mdiArrowExpandHorizontal,
  equalGaps: mdiDistributeHorizontalCenter,
  clipped: mdiFormatTextWrappingClip,
  overlap: mdiVectorIntersection,
  readability: mdiFormatSize,
  inconsistent: mdiPaletteSwatchOutline,
  feedback: mdiGestureTapButton,
  layout: mdiViewQuiltOutline,
  note: mdiNoteTextOutline,
  parent: mdiArrowUpLeft,
  group: mdiSelectGroup,
  close: mdiClose,
  undo: mdiUndo,
  redo: mdiRedo,
  remove: mdiTrashCanOutline,
  copy: mdiContentCopy,
  download: mdiTrayArrowDown,
  attach: mdiImagePlusOutline,
  chevronRight: mdiChevronRight,
  check: mdiCheck,
  dockBottom: mdiDockBottom,
  dockTop: mdiDockTop,
  dockLeft: mdiDockLeft,
  dockRight: mdiDockRight,
  touch: mdiGestureTap,
  overflow: mdiArrowExpandRight,
  textWrong: mdiSpellcheck,
  wrap: mdiWrap,
  palette: mdiPaletteOutline,
  shapes: mdiShapeOutline,
  cursor: mdiCursorDefaultClickOutline,
  keyboard: mdiKeyboardOutline,
  label: mdiTagTextOutline,
  responsive: mdiMonitorCellphone,
  back: mdiArrowLeft,
  collapse: mdiArrowCollapseDown,
  favourite: mdiStarOutline,
  padding: mdiBorderInside,
  margin: mdiBorderOutside,
  radius: mdiRoundedCorner,
  ruler: mdiRuler,
  annotations: mdiEyeOutline,
  history: mdiHistory,
  report: mdiFileDocumentCheckOutline,
  locate: mdiCrosshairsGps,
  open: mdiOpenInNew,
  popOut: mdiApplicationExport,
  putBack: mdiApplicationImport,
} as const

export type IconName = keyof typeof ICONS

/** Icons whose holes need the even-odd rule. */
export const EVENODD: ReadonlySet<string> = new Set(['crab'])

export function iconOf(name: string): string {
  return (ICONS as Record<string, string>)[name] ?? ICONS.note
}
