import type { PlayerId } from '../game/types';
import { playerShortLabel } from '../ui/resolutionTargets';
import './ResolutionSequencerUI.css';

export interface SequencerUIState {
  roundBanner: string | null;
  sidePass: PlayerId | null;
  sideTransition: PlayerId | null;
  activeResolver: PlayerId | null;
  drawBeat: boolean;
}

interface ResolutionSequencerUIProps {
  sequencer: SequencerUIState;
  onFastForward?: () => void;
  showFastForward?: boolean;
}

export function ResolutionSequencerUI({
  sequencer,
  onFastForward,
  showFastForward,
}: ResolutionSequencerUIProps) {
  const { roundBanner, sidePass, sideTransition, activeResolver, drawBeat } = sequencer;

  return (
    <>
      {showFastForward && onFastForward && (
        <button type="button" className="resolution-fast-forward" onClick={onFastForward}>
          Hızlandır
        </button>
      )}

      {roundBanner && (
        <div className="resolution-round-banner" role="status">
          <p>{roundBanner}</p>
        </div>
      )}

      {sidePass && (
        <div className="resolution-side-pass" role="status">
          <span className="resolution-side-pass-label">{playerShortLabel(sidePass)}</span>
          <span className="resolution-side-pass-text">Pas geçti</span>
        </div>
      )}

      {sideTransition && !roundBanner && (
        <div className="resolution-side-transition" role="status">
          <span>{playerShortLabel(sideTransition)} hamleleri</span>
        </div>
      )}

      {drawBeat && (
        <div className="resolution-draw-beat" role="status">
          <span>Yeni kart açılıyor</span>
        </div>
      )}

      {activeResolver && !roundBanner && !sidePass && !drawBeat && (
        <div className={`resolution-active-tag resolution-active-tag--${activeResolver}`}>
          {playerShortLabel(activeResolver)} oynuyor
        </div>
      )}
    </>
  );
}

export const IDLE_SEQUENCER: SequencerUIState = {
  roundBanner: null,
  sidePass: null,
  sideTransition: null,
  activeResolver: null,
  drawBeat: false,
};
