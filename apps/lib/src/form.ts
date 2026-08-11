import { useMemo, useState } from 'react'
import { useOAuthActions, useOAuthError } from './hooks'
import { useOAuthInstance } from './provider'

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
  // the getter, deliberately unsubscribed: `submit` needs the state *after* its own await, which a
  // subscribed snapshot captured at render time cannot give it
  const { isAuthorized } = useOAuthInstance()
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
    } finally {
      setSubmitting(false)
      // read after the await, in an event handler rather than during render, so this is the outcome of
      // the attempt that just finished — `login` reports a rejection through the token, not by throwing
      if (isAuthorized()) {
        reset()
      } else {
        // The password never stays in the DOM after an attempt. The username does: mistyping a password
        // should not also cost the user their email, which is what clearing both did.
        //
        // `submitted` goes back down with it, so the field emptied a line above does not immediately
        // shout "required" over the IdP's own message — the failure is already being reported once.
        setModel(m => ({ ...m, password: '' }))
        setSubmitted(false)
      }
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
