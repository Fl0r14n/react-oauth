import { useMemo, useState } from 'react'
import { useOAuthActions, useOAuthError } from './hooks'

/** The resource-owner credentials form with no opinion about how it looks. `component/OAuth.tsx` is one
 * skin over this; the MUI peers exist for that skin, not for the behaviour.
 *
 * Errors come back as codes rather than sentences, so nothing here needs an i18n dependency or a labels
 * object — the skin decides the wording. */

export const DEFAULT_MAX_LENGTH = 128

export type OAuthFieldError = 'required' | 'tooLong' | undefined

export interface OAuthFormField {
  value: string
  error: OAuthFieldError
  /** gate error display on this: a pristine form should not shout about empty required fields */
  showError: boolean
  onChange: (value: string) => void
}

export interface OAuthForm {
  username: OAuthFormField
  password: OAuthFormField
  valid: boolean
  /** true once submit has been attempted, valid or not */
  submitted: boolean
  submitting: boolean
  /** the IdP's rejection of the last attempt, until dismissed. Cleared automatically when it changes. */
  error: string | undefined
  dismissError: () => void
  passwordVisible: boolean
  togglePasswordVisible: () => void
  /** pass the submit event and it will be `preventDefault`ed for you */
  submit: (event?: { preventDefault?: () => void }) => Promise<void>
  reset: () => void
  maxLength: number
}

export interface UseOAuthFormOptions {
  username?: string
  password?: string
  maxLength?: number
}

const fieldError = (value: string, maxLength: number): OAuthFieldError =>
  (!value && 'required') || (value.length > maxLength && 'tooLong') || undefined

export const useOAuthForm = ({ username = '', password = '', maxLength = DEFAULT_MAX_LENGTH }: UseOAuthFormOptions = {}): OAuthForm => {
  // actions only, so typing in the form does not re-render on unrelated token writes
  const { login } = useOAuthActions()
  const flowError = useOAuthError()

  const [model, setModel] = useState({ username, password })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  // which message was dismissed, not a boolean, so a *different* failure is not silenced by an earlier
  // dismissal. Cleared on submit as well, because two attempts can fail with the identical message and
  // the second one still has to be visible — a boolean gets that case wrong in one direction or the
  // other, and deriving it here avoids the reset-state-in-an-effect pattern entirely.
  const [dismissedError, setDismissedError] = useState<string | undefined>(undefined)

  const errors = useMemo(
    () => ({
      username: fieldError(model.username, maxLength),
      password: fieldError(model.password, maxLength)
    }),
    [model, maxLength]
  )

  const valid = !errors.username && !errors.password

  const reset = () => {
    setModel({ username: '', password: '' })
    setSubmitted(false)
  }

  const submit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.()
    setSubmitted(true)
    setDismissedError(undefined)
    if (!valid) return
    setSubmitting(true)
    try {
      await login(model)
      // cleared whether or not the IdP accepted them: a rejected password should not stay in the DOM
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return {
    username: {
      value: model.username,
      error: errors.username,
      showError: submitted && !!errors.username,
      onChange: value => setModel(m => ({ ...m, username: value }))
    },
    password: {
      value: model.password,
      error: errors.password,
      showError: submitted && !!errors.password,
      onChange: value => setModel(m => ({ ...m, password: value }))
    },
    valid,
    submitted,
    submitting,
    error: (flowError !== dismissedError && flowError) || undefined,
    dismissError: () => setDismissedError(flowError),
    passwordVisible,
    togglePasswordVisible: () => setPasswordVisible(visible => !visible),
    submit,
    reset,
    maxLength
  }
}
