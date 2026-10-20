import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { formatDate, isVideo } from '../lib/format'
import { Loading, Media } from '../components/Shared'

export default function Gallery() {
  const { data, analysis: a } = useData()
  const [params] = useSearchParams()
  const linked = Number(params.get('photo')) || null
  const [open, setOpen] = useState<number | null>(linked)
  const groups = [...data.races].sort((x, y) => (x.race_date < y.race_date ? 1 : -1))
    .map((race) => ({ race, photos: data.photos.filter((p) => p.race_id === race.id) }))
    .filter((g) => g.photos.length)
  const active = data.photos.find((p) => p.id === open && !isVideo(p.image_url))
  void a

  // Coming from a race page: bring the linked photo into view once the data has loaded.
  const loaded = data.photos.length > 0
  useEffect(() => {
    if (linked && loaded) document.getElementById(`photo-${linked}`)?.scrollIntoView({ block: 'center' })
  }, [linked, loaded])

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
              <figure key={p.id} id={`photo-${p.id}`}>
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
