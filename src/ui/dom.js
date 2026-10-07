const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for interpolation into HTML. */
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);

export const sideLabel = { left: 'left', right: 'right', ahead: 'ahead of the nose', behind: 'behind the tail' };
