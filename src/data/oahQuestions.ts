/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OneAquaHealth citizen monitoring protocol question sets and indicator mappings.
 */

export interface QuestionDef {
  code: string;
  group: 'water' | 'vegetation' | 'structure';
  label: string;
  description: string;
  options: { code: string; label: string; sign?: string; isAlert?: boolean }[];
}

export const OAH_QUESTIONS: Record<string, QuestionDef> = {
  water_aspect: {
    code: 'water_aspect',
    group: 'water',
    label: 'Water Appearance',
    description: 'Visual clarity and surface condition of the stream.',
    options: [
      { code: 'clear', label: 'Clear & transparent' },
      { code: 'turbid', label: 'Murky / suspended sediment' },
      { code: 'green_algae', label: 'Green algal bloom / scum', sign: 'algal_scum', isAlert: true },
      { code: 'oily_sheen', label: 'Rainbow oil film / petrol sheen', sign: 'oil_film', isAlert: true },
      { code: 'dark_abnormal', label: 'Dark brown / grey unnatural tint', sign: 'abnormal_color', isAlert: true },
      { code: 'foamy', label: 'Persistent white / yellow foam', sign: 'foam', isAlert: true },
    ],
  },
  water_flow: {
    code: 'water_flow',
    group: 'water',
    label: 'Flow Dynamics',
    description: 'Current speed and water movement.',
    options: [
      { code: 'fast_riffle', label: 'Fast running / bubbling riffles' },
      { code: 'steady_glide', label: 'Moderate steady flow' },
      { code: 'sluggish_pool', label: 'Very slow / stagnant pools' },
      { code: 'dry_bed', label: 'Dry bed / trickling puddles' },
    ],
  },
  water_odor: {
    code: 'water_odor',
    group: 'water',
    label: 'Water Odor',
    description: 'Noticeable scents in the stream corridor.',
    options: [
      { code: 'natural', label: 'Natural / fresh earthy smell' },
      { code: 'sewage', label: 'Raw sewage / septic stench', sign: 'sewage', isAlert: true },
      { code: 'chemical', label: 'Chemical / solvent / fuel odor', sign: 'chemical_odor', isAlert: true },
      { code: 'sulfur', label: 'Rotten egg / anaerobic hydrogen sulfide', sign: 'anaerobic_decay', isAlert: true },
    ],
  },
  visible_pollution: {
    code: 'visible_pollution',
    group: 'water',
    label: 'Pollution Signs',
    description: 'Distinct contamination sources or ecological alerts.',
    options: [
      { code: 'none', label: 'No obvious pollution signs' },
      { code: 'pipe_discharge', label: 'Active pipe discharge (cloudy/colored)', sign: 'pipe_discharge', isAlert: true },
      { code: 'toilet_waste', label: 'Sanitary / toilet debris in current', sign: 'sewage', isAlert: true },
      { code: 'dead_fish', label: 'Distressed or dead aquatic fauna', sign: 'dead_fish', isAlert: true },
      { code: 'construction_silt', label: 'Heavy construction silt outflow', sign: 'siltation' },
    ],
  },
  plant_cover: {
    code: 'plant_cover',
    group: 'vegetation',
    label: 'Riparian Canopy & Cover',
    description: 'Vegetation canopy providing shade and bank protection.',
    options: [
      { code: 'dense', label: 'Continuous tree canopy (>75% shade)' },
      { code: 'moderate', label: 'Patchy trees and tall shrubs (25-75%)' },
      { code: 'open', label: 'Open grass / no tree canopy (<25%)' },
    ],
  },
  dominant_plants: {
    code: 'dominant_plants',
    group: 'vegetation',
    label: 'Dominant Bank Vegetation',
    description: 'Main plant species present along the riparian corridor.',
    options: [
      { code: 'native_riparian', label: 'Native alders, willows, reeds (Alnus, Salix)' },
      { code: 'invasive_species', label: 'Invasive species (Acacia, Arundo donax, knotweed)', sign: 'invasive_plants' },
      { code: 'brambles_scrub', label: 'Dense brambles and ruderal weeds' },
      { code: 'mowed_lawn', label: 'Maintained turf / park grass' },
    ],
  },
  margin_cuts: {
    code: 'margin_cuts',
    group: 'vegetation',
    label: 'Bank Management / Clearing',
    description: 'Evidence of mechanical cutting or herbicide clearance.',
    options: [
      { code: 'natural_intact', label: 'Natural bank - uncut vegetation' },
      { code: 'partial_trim', label: 'Selective pruning / path maintenance' },
      { code: 'bare_cut', label: 'Heavy tractor mowing or bare herbicide stripping', sign: 'habitat_loss' },
    ],
  },
  channel_form: {
    code: 'channel_form',
    group: 'structure',
    label: 'Stream Channel Form',
    description: 'Natural geomorphology versus artificial canalization.',
    options: [
      { code: 'natural_sinuous', label: 'Naturally winding with meanders and bars' },
      { code: 'straightened_earth', label: 'Channelized / dredged earth ditch' },
      { code: 'concrete_walled', label: 'Hardened concrete walls or bed' },
      { code: 'underground_box', label: 'Culvert entrance / underground duct' },
    ],
  },
  bed_substrate: {
    code: 'bed_substrate',
    group: 'structure',
    label: 'Stream Bed Substrate',
    description: 'Composition of riverbed materials.',
    options: [
      { code: 'gravel_pebbles', label: 'Clean gravel, cobbles and natural stones' },
      { code: 'sand_fine_silt', label: 'Fine sand and silt smothering the bed' },
      { code: 'anaerobic_mud', label: 'Black anaerobic organic sludge' },
      { code: 'artificial_concrete', label: 'Paved stones or smooth concrete' },
    ],
  },
};
