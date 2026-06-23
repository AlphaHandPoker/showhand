import type { FizzleToastContent } from '../ui/fizzleMessages';
import './EffectFizzleToast.css';

interface Props {
  toast: FizzleToastContent;
}

export function EffectFizzleToast({ toast }: Props) {
  return (
    <div className="effect-fizzle-toast" role="status" aria-live="polite">
      <div className="effect-fizzle-toast__inner">
        <p className="effect-fizzle-toast__title">{toast.title}</p>
        <p className="effect-fizzle-toast__body">{toast.body}</p>
      </div>
    </div>
  );
}
