export interface CatalogEntry {
  name: string
  url: string
  status?: string // release stage where the site has one (BGA alpha/beta/public, 18xx alpha/beta/production)
}
