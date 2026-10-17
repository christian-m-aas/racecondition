import { useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatDate, isVideo } from '../lib/format'
import { Loading, Media } from '../components/Shared'

export default function Gallery() {
  const { data, analysis: a } = useData()
  const [open, setOpen] = useState<number | null>(null)
  const groups = [...data.races].sort((x, y) => (x.race_date < y.race_date ? 1 : -1))
    .map((race) => ({ race, photos: data.photos.filter((p) => p.race_id === race.id) }))
    .filter((g) => g.photos.length)
  const active = data.photos.find((p) => p.id === open && !isVideo(p.image_url))
  void a

  return (
    <>
      <h1 className="page-title">Gallery</h1>
      <Loading />
      {!groups.length && <p className="muted">No photos yet.</p>}
      {groups.map(({ race, photos }) => (
        <section key={race.id}>
          <h2>{race.name} <small className="muted">{formatDate(race.race_date)}</small></h2>
          <div className="gallery">
            {photos.map((p) => (
              <figure key={p.id}>
                <Media url={p.image_url} caption={p.caption} onOpen={() => setOpen(p.id)} />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      ))}
      {active && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={active.image_url} alt={active.caption ?? ''} />
          {active.caption && <p>{active.caption}</p>}
        </div>
      )}
    </>
  )
}
