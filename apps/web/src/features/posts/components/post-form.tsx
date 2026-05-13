import type { CreatePostInput } from '@mina/contracts'
import { Button } from '@mina/ui/components/button'
import { Input } from '@mina/ui/components/input'
import { Label } from '@mina/ui/components/label'
import { Textarea } from '@mina/ui/components/textarea'
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
      <Label className="field">
        <span>Title</span>
        <Input
          aria-invalid={Boolean(validationMessage && nextValidationField(validationMessage) === 'title')}
          autoComplete="off"
          name="title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Describe the engineering decision"
          value={title}
        />
      </Label>

      <Label className="field">
        <span>Body</span>
        <Textarea
          aria-invalid={Boolean(validationMessage && nextValidationField(validationMessage) === 'body')}
          name="body"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Capture the reasoning, tradeoffs, or implementation note."
          rows={5}
          value={body}
        />
      </Label>

      <div className="form-footer">
        <p className="helper-text" data-tone={helperMessage ? 'error' : 'muted'}>
          {helperMessage ?? 'Shared contracts validate both the client and the Hono API.'}
        </p>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Publishing...' : 'Create post'}
        </Button>
      </div>
    </form>
  )
}

function nextValidationField(message: string) {
  return message.startsWith('Title') ? 'title' : 'body'
}
