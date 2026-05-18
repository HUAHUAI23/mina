const passwordApi = Bun.password

export const hashPassword = async (password: string): Promise<string> => passwordApi.hash(password, 'argon2id')

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> =>
  passwordApi.verify(password, passwordHash)
