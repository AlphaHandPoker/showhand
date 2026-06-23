export interface AnchorRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export function readElementRect(el: Element): AnchorRect | null {
  const card = el.querySelector('.effect-card, .effect-card-back');
  const target = card ?? el;
  const r = target.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: r.width,
    h: r.height,
  };
}

export function readAnchorRect(selector: string): AnchorRect | null {
  const anchor = document.querySelector(selector);
  if (!anchor) return null;
  return readElementRect(anchor);
}

export function readCastCenterRect(): AnchorRect {
  const sourceCard = document.querySelector('[data-cast-flight-source] .effect-card');
  if (sourceCard) {
    const r = sourceCard.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    }
  }

  const anchor = document.querySelector('.cast-center-anchor')
    ?? document.querySelector('[data-cast-center-anchor="measure"]');
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    }
  }
  return {
    cx: window.innerWidth / 2,
    cy: window.innerHeight / 2,
    w: 86,
    h: 120,
  };
}
