import { PROGRESS_STOPS, getStatusProgress } from '@/lib/status';

const STOPS = Array.from({ length: PROGRESS_STOPS }, (_, index) => index + 1);

// Five stops along a selection's route, filled up to where it stands: the
// accent while open, all green on arrival, hollow grey once it left the
// route. Decorative, since the status label beside it or the column it sits
// in already names the stage.
export default function ProgressRail({ status }) {
  const { step, state } = getStatusProgress(status);
  return (
    <span className={`progress-rail progress-rail--${state}`} aria-hidden="true">
      {STOPS.map(stop => {
        const on = state === 'open' && stop <= step;
        const current = state === 'open' && stop === step;
        return <span key={stop} className={`progress-stop${on ? ' progress-stop--on' : ''}${current ? ' progress-stop--current' : ''}`} />;
      })}
    </span>
  );
}
