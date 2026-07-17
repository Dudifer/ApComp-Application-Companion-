import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type {
  RankedJob, JobInteractionRecord, InteractionType, TimelinePoint, DismissedJob, WeightVectorSummary,
} from '@apcomp/types';
import { useApi } from '../lib/api';

/**
 * Rec Lab — sandbox for the embedding-based recommendation + interaction-
 * scoring system. Lets you see exactly why a job was ranked where it was
 * (CV similarity breakdown + similarity to jobs you've liked before), fire
 * interactions (click/save/apply/more-like-this/ignore/dismiss/less-like-
 * this) and watch the ranking react, and "replay" — edit or remove a past
 * interaction to see how that change ripples through the whole ranking.
 */

const POSITIVE_TYPES: InteractionType[] = ['CLICKED', 'SAVED', 'APPLIED', 'MORE_LIKE_THIS'];
const NEGATIVE_TYPES: InteractionType[] = ['IGNORED', 'DISMISSED', 'LESS_LIKE_THIS'];

const TYPE_LABELS: Record<InteractionType, string> = {
  VIEWED: 'Viewed',
  CLICKED: 'Click',
  SAVED: 'Save',
  APPLIED: 'Apply',
  MORE_LIKE_THIS: 'More like this',
  IGNORED: 'Ignore',
  DISMISSED: 'Dismiss',
  LESS_LIKE_THIS: 'Less like this',
};