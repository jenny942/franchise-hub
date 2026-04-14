import { NextResponse } from 'next/server'
import Papa from 'papaparse'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const SHEET_TABS = {
  locations:     '2090204655',
  opportunities: '858384788',
  revenue:       '1434180438',
  spend:         '1993652208',
}

// Fetch a Google Sheet tab as parsed CSV rows
async function fetchSheet(gid: string): Promise<Record<string, string>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  return data
}

function parseDate(val: string): string | null {
  if (!val || val.trim() === '' || val === 'undefined') return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function parseNumber(val: string): number {
  if (!val) return 0
  return parseFloat(val.replace(/[$,]/g, '')) || 0
}

// ── SYNC LOCATIONS ──────────────────────────────────────────
async function syncLocations() {
  const rows = await fetchSheet(SHEET_TABS.locations)
  const records = rows
    .filter(r => r['Location (CapForge)'] && r['Location (GHL)'])
    .map(r => ({
      name:     r['Location (CapForge)'].trim(),
      name_ghl: r['Location (GHL)'].trim(),
    }))

  const { error } = await supabaseAdmin
    .from('locations')
    .upsert(records, { onConflict: 'name' })

  if (error) throw new Error(`Locations sync failed: ${error.message}`)
  return records.length
}

// ── SYNC OPPORTUNITIES ───────────────────────────────────────
async function syncOpportunities(locationMap: Record<string, string>) {
  const rows = await fetchSheet(SHEET_TABS.opportunities)

  const records = rows
    .filter(r => r['Opportunity ID'] && r['Location'])
    .map(r => {
      const locationName = r['Location']?.trim()
      const locationId = locationMap[locationName]
      if (!locationId) return null

      return {
        opportunity_id: r['Opportunity ID'].trim(),
        location_id:    locationId,
        date:           parseDate(r['Date (PDT)']),
        last_updated:   parseDate(r['Last Updated (PDT)']),
        customer_id:    r['Customer ID'] || null,
        customer_name:  r['Customer Name'] || null,
        source:         r['Source'] || null,
        pipeline:       r['Pipeline'] || null,
        stage_id:       r['Stage ID'] || null,
        stage_name:     r['Stage Name'] || null,
        status:         ['won','lost','open'].includes(r['Status']) ? r['Status'] : 'open',
        value:          parseNumber(r['Value']),
        customer_ltv:   parseNumber(r['Customer LTV']),
        primary_source: r['Primary Source'] || null,
        frequency_type: r['Frequency Type'] || null,
        synced_at:      new Date().toISOString(),
      }
    })
    .filter(Boolean)

  // Upsert in batches of 500 to avoid request size limits
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('opportunities')
      .upsert(batch, { onConflict: 'opportunity_id' })
    if (error) throw new Error(`Opportunities sync failed: ${error.message}`)
  }

  return records.length
}

// Deduplicate records by a composite key to avoid upsert conflicts within the same batch
function dedupe<T extends Record<string, any>>(records: T[], ...keyFields: string[]): T[] {
  const seen = new Set<string>()
  return records.filter(r => {
    const key = keyFields.map(f => r[f]).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── SYNC REVENUE ─────────────────────────────────────────────
async function syncRevenue(locationMap: Record<string, string>) {
  const rows = await fetchSheet(SHEET_TABS.revenue)

  const records = dedupe(
    rows
      .filter(r => r['Location'] && r['Period Start'])
      .map(r => {
        const locationId = locationMap[r['Location']?.trim()]
        if (!locationId) return null
        return {
          location_id:  locationId,
          source_type:  r['Source']?.trim() || 'Long Term',
          period_start: parseDate(r['Period Start']),
          period_end:   parseDate(r['Period End']),
          amount:       parseNumber(r['Revenue']),
          synced_at:    new Date().toISOString(),
        }
      })
      .filter(Boolean) as Record<string, any>[],
    'location_id', 'source_type', 'period_start'
  )

  const { error } = await supabaseAdmin
    .from('revenue')
    .upsert(records, { onConflict: 'location_id,source_type,period_start' })

  if (error) throw new Error(`Revenue sync failed: ${error.message}`)
  return records.length
}

// ── SYNC SPEND ───────────────────────────────────────────────
async function syncSpend(locationMap: Record<string, string>) {
  const rows = await fetchSheet(SHEET_TABS.spend)

  const records = dedupe(
    rows
      .filter(r => r['Location'] && r['Period Start'])
      .map(r => {
        const locationId = locationMap[r['Location']?.trim()]
        if (!locationId) return null
        return {
          location_id:  locationId,
          channel:      r['Source']?.trim() || 'Other',
          period_start: parseDate(r['Period Start']),
          period_end:   parseDate(r['Period End']),
          amount:       parseNumber(r['Ad Spend']),
          synced_at:    new Date().toISOString(),
        }
      })
      .filter(Boolean) as Record<string, any>[],
    'location_id', 'channel', 'period_start'
  )

  const { error } = await supabaseAdmin
    .from('spend')
    .upsert(records, { onConflict: 'location_id,channel,period_start' })

  if (error) throw new Error(`Spend sync failed: ${error.message}`)
  return records.length
}

// ── MAIN SYNC HANDLER ────────────────────────────────────────
export async function POST() {
  try {
    // Step 1: sync locations first so we can map names → IDs
    const locationCount = await syncLocations()

    // Step 2: build a name → id map for the other syncs
    const { data: locations } = await supabaseAdmin
      .from('locations')
      .select('id, name')

    const locationMap: Record<string, string> = {}
    for (const loc of locations ?? []) {
      locationMap[loc.name] = loc.id
    }

    // Step 3: sync everything else in parallel
    const [oppCount, revCount, spendCount] = await Promise.all([
      syncOpportunities(locationMap),
      syncRevenue(locationMap),
      syncSpend(locationMap),
    ])

    return NextResponse.json({
      success: true,
      synced: {
        locations:     locationCount,
        opportunities: oppCount,
        revenue:       revCount,
        spend:         spendCount,
      }
    })
  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
