import type { CatalogQuery } from '@/lib/catalog-query'
import {
  type CatalogCandidate,
  CatalogError,
  displayIdentifier,
  type FetchLike,
  localizedValue,
  MAX_POKEMON_ID,
  normalizeFlavorText,
  normalizePokemon,
  POKEAPI_URL,
  type PokemonDetailRecord,
  type PokemonRecord,
  parseAbilityPayload,
  parseGenerationPayload,
  parseListPayload,
  parsePokemonPayload,
  parseTypePayload,
  resourceCandidate,
  sortCandidates,
  trustedAbilityUrl,
  trustedSpeciesUrl,
} from '@/server/catalog/model'

async function fetchJson(url: string, fetcher: FetchLike) {
  const signal = AbortSignal.timeout(5_000)
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch {
    throw new CatalogError()
  }
  if (response.status === 404) {
    throw new CatalogError('Pokémon no encontrado.', 404)
  }
  if (!response.ok) throw new CatalogError()
  try {
    return (await response.json()) as unknown
  } catch {
    throw new CatalogError()
  }
}

export function createPokeApiClient(fetcher: FetchLike) {
  async function getPokemon(identifier: string, now: Date) {
    const pokemonPayload = await fetchJson(
      `${POKEAPI_URL}/pokemon/${encodeURIComponent(identifier)}`,
      fetcher,
    )
    const pokemon = parsePokemonPayload(pokemonPayload)
    const speciesPayload = await fetchJson(
      trustedSpeciesUrl(pokemon.species),
      fetcher,
    )
    return normalizePokemon(pokemonPayload, speciesPayload, now)
  }

  async function enrichAbilities(
    pokemon: PokemonRecord,
  ): Promise<PokemonDetailRecord> {
    const abilities = await Promise.all(
      pokemon.abilities.map(async (ability) => {
        const payload = parseAbilityPayload(
          await fetchJson(trustedAbilityUrl(ability.name), fetcher),
        )
        return {
          name: ability.name,
          hidden: ability.hidden,
          displayName:
            localizedValue(payload.names, (entry) => entry.name) ??
            displayIdentifier(ability.name),
          description:
            localizedValue(payload.flavor_text_entries, (entry) =>
              normalizeFlavorText(entry.flavor_text),
            ) ?? null,
        }
      }),
    )
    return { ...pokemon, abilities }
  }

  async function listPage(offset: number, limit: number) {
    return parseListPayload(
      await fetchJson(
        `${POKEAPI_URL}/pokemon?offset=${offset}&limit=${limit}`,
        fetcher,
      ),
    )
  }

  async function listCandidates(query: CatalogQuery) {
    const [typeInput, generationInput, abilityInput] = await Promise.all([
      query.type === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/type/${encodeURIComponent(query.type)}`,
            fetcher,
          ),
      query.generation === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/generation/${encodeURIComponent(query.generation)}`,
            fetcher,
          ),
      query.ability === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/ability/${encodeURIComponent(query.ability)}`,
            fetcher,
          ),
    ])

    const candidateSets = [
      typeInput === undefined
        ? undefined
        : parseTypePayload(typeInput)
            .pokemon.map((entry) => resourceCandidate(entry.pokemon))
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
      generationInput === undefined
        ? undefined
        : parseGenerationPayload(generationInput)
            .pokemon_species.map(resourceCandidate)
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
      abilityInput === undefined
        ? undefined
        : parseTypePayload(abilityInput)
            .pokemon.map((entry) => resourceCandidate(entry.pokemon))
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
    ].filter((set): set is CatalogCandidate[] => set !== undefined)

    let candidates = candidateSets[0]
    if (candidates === undefined) {
      candidates = parseListPayload(
        await fetchJson(
          `${POKEAPI_URL}/pokemon?offset=0&limit=${MAX_POKEMON_ID}`,
          fetcher,
        ),
      )
        .results.map(resourceCandidate)
        .filter((entry): entry is CatalogCandidate => entry !== undefined)
    } else {
      for (const set of candidateSets.slice(1)) {
        const ids = new Set(set.map((entry) => entry.id))
        candidates = candidates.filter((entry) => ids.has(entry.id))
      }
    }

    const unique = [
      ...new Map(candidates.map((entry) => [entry.name, entry])).values(),
    ]
    return sortCandidates(
      unique.filter((entry) =>
        /^\d+$/.test(query.query)
          ? entry.id === Number(query.query)
          : entry.name.includes(query.query),
      ),
      query.sort,
    )
  }

  return { enrichAbilities, getPokemon, listCandidates, listPage }
}
