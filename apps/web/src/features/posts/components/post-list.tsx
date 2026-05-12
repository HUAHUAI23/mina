import type { Post } from '@mina/contracts'

interface PostListProps {
  deletingPostId: number | undefined
  onDelete: (id: number) => void
  posts: Post[]
}

const formatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function PostList({ deletingPostId, onDelete, posts }: PostListProps) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <h3>No posts yet</h3>
        <p>Create the first record to verify the end-to-end Hono contract.</p>
      </div>
    )
  }

  return (
    <div className="post-list">
      {posts.map((post) => {
        const isDeleting = deletingPostId === post.id

        return (
          <article className="post-card" key={post.id}>
            <div className="post-card-header">
              <div>
                <p className="eyebrow">Record #{post.id}</p>
                <h3>{post.title}</h3>
              </div>
              <button className="ghost-button" disabled={isDeleting} onClick={() => onDelete(post.id)} type="button">
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            </div>

            <p className="post-body">{post.body}</p>
            <p className="post-meta">Created {formatter.format(new Date(post.createdAt))}</p>
          </article>
        )
      })}
    </div>
  )
}
