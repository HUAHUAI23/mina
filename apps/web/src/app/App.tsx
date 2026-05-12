import { PostForm } from '../features/posts/components/post-form'
import { PostList } from '../features/posts/components/post-list'
import { useCreatePostMutation, useDeletePostMutation, usePostsQuery } from '../features/posts/hooks/use-posts'
import { getErrorMessage } from '../lib/http'

const formatTimestamp = (value: string | undefined): string => {
  if (!value) {
    return 'No data yet'
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function App() {
  const postsQuery = usePostsQuery()
  const createPost = useCreatePostMutation()
  const deletePost = useDeletePostMutation()

  const posts = postsQuery.data ?? []
  const latestPost = posts[0]
  const deletingPostId = deletePost.isPending ? deletePost.variables : undefined

  return (
    <main className="shell">
      <section className="hero panel">
        <div className="hero-copy">
          <p className="hero-label">Bun + Hono Full Stack</p>
          <h1>Engineered for typed contracts, isolated modules, and maintainable growth.</h1>
          <p className="hero-description">
            The UI consumes a typed Hono RPC client, while the API is split into app wiring, module routes, services,
            repositories, and contracts.
          </p>
        </div>

        <div className="hero-metrics">
          <div className="metric-card">
            <span>Total posts</span>
            <strong>{posts.length}</strong>
          </div>
          <div className="metric-card">
            <span>Latest activity</span>
            <strong>{formatTimestamp(latestPost?.createdAt)}</strong>
          </div>
          <div className="metric-card">
            <span>Validation model</span>
            <strong>Zod contracts shared across the stack</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Write path</p>
              <h2>Create a post</h2>
            </div>
            <p>Mutations invalidate the query cache and keep the UI synchronized with the API.</p>
          </div>

          <PostForm
            errorMessage={createPost.error ? getErrorMessage(createPost.error) : undefined}
            isSubmitting={createPost.isPending}
            onCreate={(input) => createPost.mutateAsync(input)}
          />
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Read path</p>
              <h2>Post records</h2>
            </div>
            <p>Responses are parsed against shared schemas before they reach the component tree.</p>
          </div>

          {postsQuery.isPending ? (
            <div className="empty-state">
              <h3>Loading records</h3>
              <p>Fetching the latest payload from the Hono API.</p>
            </div>
          ) : postsQuery.isError ? (
            <div className="empty-state">
              <h3>Unable to load records</h3>
              <p>{getErrorMessage(postsQuery.error)}</p>
            </div>
          ) : (
            <>
              {deletePost.error ? (
                <p className="helper-text" data-tone="error">
                  {getErrorMessage(deletePost.error)}
                </p>
              ) : null}

              <PostList deletingPostId={deletingPostId} onDelete={(id) => deletePost.mutate(id)} posts={posts} />
            </>
          )}
        </article>
      </section>
    </main>
  )
}
