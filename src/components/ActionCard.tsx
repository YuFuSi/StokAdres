type ActionCardProps = {
  icon: string
  title: string
  description: string
}

export function ActionCard({ icon, title, description }: ActionCardProps) {
  return (
    <button className="action-card" type="button" aria-label={title}>
      <span className="action-card__icon" aria-hidden="true">{icon}</span>
      <span className="action-card__content">
        <span className="action-card__title">{title}</span>
        <span className="action-card__description">{description}</span>
      </span>
      <span className="action-card__arrow" aria-hidden="true">&#8594;</span>
    </button>
  )
}
