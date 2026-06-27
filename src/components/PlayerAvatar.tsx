import avatarImg from '../assets/avatar-placeholder.png';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  label?: string;
  size?: 'small' | 'large';
  src?: string;
  winner?: boolean;
  loser?: boolean;
  className?: string;
}

export function PlayerAvatar({
  label,
  size = 'small',
  src = avatarImg,
  winner,
  loser,
  className,
}: PlayerAvatarProps) {
  return (
    <div
      className={[
        'player-avatar',
        `player-avatar--${size}`,
        winner && 'player-avatar--winner',
        loser && 'player-avatar--loser',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="player-avatar-frame">
        <img src={src} alt={label ?? 'Oyuncu'} className="player-avatar-img" />
      </div>
      {label && <span className="player-avatar-label">{label}</span>}
    </div>
  );
}
