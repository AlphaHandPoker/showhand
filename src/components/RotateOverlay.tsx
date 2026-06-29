import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import './RotateOverlay.css';

const MOBILE_MQ = '(max-width: 1024px), (max-height: 600px) and (pointer: coarse)';
const PORTRAIT_MQ = '(orientation: portrait)';

export function RotateOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const mobileMq = window.matchMedia(MOBILE_MQ);
    const portraitMq = window.matchMedia(PORTRAIT_MQ);

    const update = () => {
      const isMobileDevice =
        mobileMq.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setShow(isMobileDevice && portraitMq.matches);
    };

    update();
    mobileMq.addEventListener('change', update);
    portraitMq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mobileMq.removeEventListener('change', update);
      portraitMq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="rotate-overlay" aria-live="polite">
      <div className="rotate-overlay__content">
        <div className="rotate-overlay__icon">
          <RotateCw size={56} strokeWidth={1.5} />
          <div className="rotate-overlay__phone">
            <div className="rotate-phone-body" />
          </div>
        </div>
        <p className="rotate-overlay__text">
          Daha iyi deneyim için telefonunuzu yatay tutun
        </p>
      </div>
    </div>
  );
}
