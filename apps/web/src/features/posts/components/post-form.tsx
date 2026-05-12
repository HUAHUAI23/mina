import type { CreatePostInput } from '@mina/contracts'
import { useState, type FormEvent } from 'react'

interface PostFormProps {
  errorMessage: string | undefined
  isSubmitting: boolean
  onCreate: (input: CreatePostInput) => Promise<unknown>
}

export function PostForm({ errorMessage, isSubmitting, onCreate }: PostFormProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextTitle = title.trim()
    const nextBody = body.trim()

    if (nextTitle.length < 3) {
      setValidationMessage('Title must contain at least 3 characters.')
      return
    }

    if (nextBody.length < 10) {
      setValidationMessage('Body must contain at least 10 characters.')
      return
    }

    setValidationMessage(null)

    try {
      await onCreate({ title: nextTitle, body: nextBody })
      setTitle('')
      setBody('')
    } catch {
      // Mutation state already captures the server error.
    }
  }

  const helperMessage = validationMessage ?? errorMessage

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Title</span>
        <input
          autoComplete="off"
          name="title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Describe the engineering decision"
          value={title}
        />
      </label>

      <label className="field">
        <span>Body</span>
        <textarea
          name="body"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Capture the reasoning, tradeoffs, or implementation note."
          rows={5}
          value={body}
        />
      </label>

      <div className="form-footer">
        <p className="helper-text" data-tone={helperMessage ? 'error' : 'muted'}>
          {helperMessage ?? 'Shared contracts validate both the client and the Hono API.'}
        </p>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Publishing...' : 'Create post'}
        </button>
      </div>
    </form>
  )
}
