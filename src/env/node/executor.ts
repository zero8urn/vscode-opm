// Minimal executor stub for node environment
export async function exec(repositoryPath: string, args: string[]): Promise<string> {
  // In a real implementation this would call child_process.exec
  return Promise.resolve('');
}
