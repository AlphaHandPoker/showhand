import type { PlayerId } from '../game/types';
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
  onFastForward,
  showFastForward,
}: ResolutionSequencerUIProps) {
  if (!showFastForward || !onFastForward) return null;

  return (
    <button type="button" className="resolution-fast-forward" onClick={onFastForward}>
      Speed up
    </button>
  );
}

export const IDLE_SEQUENCER: SequencerUIState = {
  roundBanner: null,
  sidePass: null,
  sideTransition: null,
  activeResolver: null,
  drawBeat: false,
};
