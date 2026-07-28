import React from 'react'

export function ExperienceResearchWorkspace({
  compact = false,
  hasDossier = false,
  kicker = '我的经历',
  title = '经历调研',
  subtitle = 'AI 给选项，你确认和补充，最后沉淀经历档案',
  action,
  chat,
  dossier,
}) {
  return (
    <div className={`experience-workspace ${compact ? 'is-compact' : ''} ${hasDossier ? 'has-dossier' : ''}`}>
      <section className="experience-workspace-chat">
        <header className="experience-workspace-header">
          <div>
            <span>{kicker}</span>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
          {action && <div className="experience-workspace-action">{action}</div>}
        </header>
        <div className="experience-workspace-chat-body">{chat}</div>
      </section>
      <section className="experience-workspace-dossier">{dossier}</section>
    </div>
  )
}

export function ExperienceChoiceCards({
  options = [],
  selected = [],
  multiple = false,
  disabled = false,
  compact = false,
  onSelect,
  onConfirm,
}) {
  return (
    <div className={`experience-choice-panel ${compact ? 'is-compact' : ''}`}>
      <p>{multiple ? '可以多选，选好后确认；也可以补充真实情况' : '选择一个继续，也可以补充真实情况'}</p>
      <div className="experience-choice-grid">
        {options.map(option => {
          const active = selected.some(item => item.label === option.label)
          return (
            <button
              key={`${option.label}-${option.text}`}
              type="button"
              className={active ? 'is-selected' : ''}
              disabled={disabled}
              onClick={() => onSelect?.(option)}
            >
              <b>{active ? '✓' : option.label}</b>
              <span>{option.text}</span>
            </button>
          )
        })}
      </div>
      {multiple && (
        <div className="experience-choice-confirm">
          <button type="button" disabled={selected.length === 0 || disabled} onClick={onConfirm}>
            确认选择
          </button>
        </div>
      )}
    </div>
  )
}

export function ExperienceDossierProgress({
  compact = false,
  progress = 0,
  title = '经历档案',
  subtitle = '确认的信息会实时沉淀到这里',
  fields = [],
  note = '',
}) {
  return (
    <div className={`experience-dossier-progress ${compact ? 'is-compact' : ''}`}>
      <div className="experience-dossier-progress-title">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <b>{progress}%</b>
      </div>
      <div className="experience-dossier-meter"><span style={{ width: `${progress}%` }} /></div>
      <div className="experience-dossier-fields">
        {fields.map(field => (
          <div key={field.label} className={`${field.confirmed ? 'is-confirmed' : ''} ${field.highlight ? 'is-new' : ''}`}>
            <span>{field.label}</span>
            <p>{field.value || '待补充'}</p>
          </div>
        ))}
      </div>
      {note && <div className="experience-dossier-note">{note}</div>}
    </div>
  )
}
