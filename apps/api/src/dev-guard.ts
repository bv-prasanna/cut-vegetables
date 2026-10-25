/** Disallow demo API when explicitly launched in a production environment. */
export function allowDevelopmentApi(environment: string | undefined): boolean {
 return environment !== 'production';
}
