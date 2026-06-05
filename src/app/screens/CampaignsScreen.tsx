import { useState, useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useApp } from '../context/AppContext';
import { apiService } from '../../services/api.service';
import { X, Plus, ChevronRight, Target, Trash2, Eye, Edit, Pause, Play, MoreVertical, Layers, Tv, Folder, Megaphone, CheckSquare, Square, Copy, ArrowUpDown, Calendar, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import PageWrapper from '../components/shared/PageWrapper';
import ClientAvatar from '../components/shared/ClientAvatar';
import StatusBadge from '../components/shared/StatusBadge';
import PlatformDot from '../components/shared/PlatformDot';

function getCampaignLink(campaign?: any, targetType: 'adsets' | 'campaigns' = 'adsets') {
  if (!campaign) {
    if (targetType === 'campaigns') {
      return 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&nav_source=no_referrer#';
    }
    return 'https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&nav_source=no_referrer';
  }
  const platform = String(campaign.platform || campaign.channel || '').toLowerCase();
  const id = campaign.id || campaign.campaignId || '';
  
  if (platform.includes('google') || platform.includes('youtube')) {
    return 'https://ads.google.com/';
  }
  
  if (targetType === 'campaigns') {
    if (id) {
      return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&selected_campaign_ids=${id}&nav_source=no_referrer#`;
    }
    return 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&nav_source=no_referrer#';
  }
  
  if (id) {
    return `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&selected_campaign_ids=${id}&nav_source=no_referrer`;
  }
  
  return 'https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&nav_source=no_referrer';
}

// Helper function to generate mock ad sets based on the campaign metrics
function getAdSetsForCampaign(campaign: any) {
  if (!campaign) return [];
  const spend = campaign.spend || 0;
  const conv = campaign.conv || 0;
  const roas = campaign.roas || null;
  const clicks = campaign.clicks || 0;
  const impressions = campaign.impressions || 0;
  const status = campaign.status || 'healthy';

  return [
    {
      id: `${campaign.id}-adset-1`,
      name: `Lookalike 1–2% — Active Buyers (${campaign.name})`,
      spend: Math.round(spend * 0.45),
      clicks: Math.round(clicks * 0.48),
      impressions: Math.round(impressions * 0.44),
      conv: Math.round(conv * 0.52),
      roas: roas ? Number((roas * 1.15).toFixed(2)) : null,
      status: status === 'critical' ? 'critical' : 'healthy',
      active: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
    },
    {
      id: `${campaign.id}-adset-2`,
      name: `Custom Audience — Website Retargeting 30d (${campaign.name})`,
      spend: Math.round(spend * 0.35),
      clicks: Math.round(clicks * 0.32),
      impressions: Math.round(impressions * 0.36),
      conv: Math.round(conv * 0.38),
      roas: roas ? Number((roas * 1.25).toFixed(2)) : null,
      status: 'healthy',
      active: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
    },
    {
      id: `${campaign.id}-adset-3`,
      name: `Broad Interest Targeting — High Affinity Core (${campaign.name})`,
      spend: Math.round(spend * 0.2),
      clicks: Math.round(clicks * 0.2),
      impressions: Math.round(impressions * 0.2),
      conv: Math.round(conv * 0.1),
      roas: roas ? Number((roas * 0.6).toFixed(2)) : null,
      status: status === 'healthy' ? 'healthy' : 'at_risk',
      active: false,
      campaignId: campaign.id,
      campaignName: campaign.name,
    },
  ];
}

// Helper function to generate mock ads based on adset metrics
function getAdsForAdSet(adset: any, campaign: any) {
  if (!adset) return [];
  const spend = adset.spend || 0;
  const conv = adset.conv || 0;
  const roas = adset.roas || null;
  const clicks = adset.clicks || 0;
  const status = adset.status || 'healthy';

  const clientName = campaign?.clientId === 'finedge' ? 'FinEdge' : campaign?.clientId === 'bloombox' ? 'BloomBox' : campaign?.clientId === 'orbit' ? 'Orbit SaaS' : 'Nova Sportswear';

  const adsConfig = [
    {
      name: `Video Ad — Customer Testimonials (UGC 1:1) — ${adset.name}`,
      headline: `Real Reviews, Real Outcomes | Try ${clientName}`,
      copy: `Tired of guesswork? See why thousands of active users trust ${clientName} for their everyday routine. Grab yours now with free delivery!`,
      ctr: 2.85,
      bg: 'from-blue-500/80 to-violet-600/80',
    },
    {
      name: `Carousel Ad — Product Features & Details — ${adset.name}`,
      headline: `Limited Offer: Save 20% on the ${clientName} Collection`,
      copy: `Upgrade your style and elevate your standards with the new seasonal collection from ${clientName}. Click below to apply your discount.`,
      ctr: 1.94,
      bg: 'from-rose-500/80 to-pink-600/80',
    },
    {
      name: `Static Image — High-Impact Hero Graphic — ${adset.name}`,
      headline: `Empower Your Operations with ${clientName}`,
      copy: `Achieve more in less time. Discover the state-of-the-art layout built by ${clientName} specialists to take your workflows to the next level.`,
      ctr: 1.12,
      bg: 'from-amber-400/80 to-orange-500/80',
    },
  ];

  return adsConfig.map((ad, idx) => ({
    id: `${adset.id}-ad-${idx + 1}`,
    name: ad.name,
    headline: ad.headline,
    copy: ad.copy,
    imageUrl: idx === 0 
      ? 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80' // Offroad SUV
      : idx === 1
      ? 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&auto=format&fit=crop&q=80' // Sleek modern car
      : 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80', // Dark sporty car
    spend: Math.round(spend * (idx === 0 ? 0.5 : idx === 1 ? 0.3 : 0.2)),
    clicks: Math.round(clicks * (idx === 0 ? 0.55 : idx === 1 ? 0.28 : 0.17)),
    conv: Math.round(conv * (idx === 0 ? 0.6 : idx === 1 ? 0.3 : 0.1)),
    roas: roas ? Number((roas * (idx === 0 ? 1.2 : idx === 1 ? 1.0 : 0.5)).toFixed(2)) : null,
    ctr: ad.ctr,
    status: idx === 2 ? 'warning' : status === 'critical' ? 'critical' : 'healthy',
    active: idx !== 2,
    bgGradient: ad.bg,
    adsetId: adset.id,
    adsetName: adset.name,
  }));
}

const getGoalBadgeStyle = (goal: string) => {
  const norm = String(goal || '').toLowerCase();
  if (norm.includes('lead')) return 'bg-emerald-50 text-emerald-700 border-emerald-250';
  if (norm.includes('conv')) return 'bg-indigo-50 text-indigo-700 border-indigo-250';
  if (norm.includes('traffic')) return 'bg-blue-50 text-blue-750 border-blue-250';
  return 'bg-slate-50 text-slate-700 border-slate-250';
};

const getAudienceBadgeStyle = (audience: string) => {
  const norm = String(audience || '').toLowerCase();
  if (norm.includes('retarget')) return 'bg-purple-50 text-purple-700 border-purple-250';
  if (norm.includes('lookalike') || norm.includes('lal')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-250';
  if (norm.includes('broad')) return 'bg-cyan-50 text-cyan-750 border-cyan-250';
  return 'bg-pink-50 text-pink-700 border-pink-250';
};

const getFormatBadgeStyle = (format: string) => {
  const norm = String(format || '').toLowerCase();
  if (norm.includes('video') || norm.includes('vid')) return 'bg-amber-50 text-amber-700 border-amber-250';
  if (norm.includes('carousel')) return 'bg-teal-50 text-teal-700 border-teal-250';
  if (norm.includes('search')) return 'bg-orange-50 text-orange-700 border-orange-250';
  return 'bg-sky-50 text-sky-750 border-sky-250';
};

export default function CampaignsScreen() {
  const {
    scopedCampaigns: campaigns,
    campaigns: allCampaigns,
    setCampaigns,
    activeClient,
    selectedClientId,
    setSelectedClientId,
    campaignFilter,
    setCampaignFilter,
    setShowCampaignModal,
    setEditingCampaign,
  } = useApp();

  const { CLIENTS: clients } = useApp() as any;

  // Navigation and Filter state
  const [activeTab, setActiveTab] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);

  // Track image loading errors to dynamically replace broken Meta image URLs
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Checkbox selections for the three tabs
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<number | string>>(new Set());
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<Set<string>>(new Set());
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());

  // Delete modal state
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  // Dynamically constructed arrays for Ad Sets and Ads
  const [allAdSets, setAllAdSets] = useState<any[]>([]);
  const [allAds, setAllAds] = useState<any[]>([]);
  const [isLoadingAdSets, setIsLoadingAdSets] = useState(false);
  const [isLoadingAds, setIsLoadingAds] = useState(false);
  const [selectedAdForPreview, setSelectedAdForPreview] = useState<any | null>(null);

  // Status and month filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'google'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [selectedRangeLabel, setSelectedRangeLabel] = useState('1 May 2026 - 25 May 2026');

  // Calendar month/year navigation state (Left month is indexed 4 = May 2026)
  const [leftMonth, setLeftMonth] = useState<number>(4);
  const [leftYear, setLeftYear] = useState<number>(2026);

  const rightMonth = (leftMonth + 1) % 12;
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getCalendarDays = (month: number, year: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const handlePrevMonth = () => {
    setLeftMonth(prev => {
      if (prev === 0) {
        setLeftYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setLeftMonth(prev => {
      if (prev === 11) {
        setLeftYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  // Advanced Meta-style Date Range Picker States
  const [startDate, setStartDate] = useState<string>('2026-05-01');
  const [endDate, setEndDate] = useState<string>('2026-05-25');
  const [tempStartDate, setTempStartDate] = useState<string>('2026-05-01');
  const [tempEndDate, setTempEndDate] = useState<string>('2026-05-25');
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [compareEnabled, setCompareEnabled] = useState<boolean>(false);
  const [comparePreset, setComparePreset] = useState<string>('previous_period');

  // ═══════════════════════════════════════════════════════════════════════════════
  // GENERATE DYNAMIC AD SETS & ADS ACROSS SYNCHRONIZED METRICS (MOCK MODE ONLY)
  // ═══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!apiService.isMockMode) return;

    // Generate adsets for all matching campaigns
    const sets = campaigns.flatMap(c => getAdSetsForCampaign(c));
    setAllAdSets(sets);

    // Generate ads for all generated adsets
    const creativeAds = sets.flatMap(as => {
      const camp = campaigns.find(c => String(c.id) === String(as.campaignId));
      return getAdsForAdSet(as, camp);
    });
    setAllAds(creativeAds);
  }, [campaigns]);

  // Fetch real adsets dynamically from API when selected campaign changes (non-mock mode)
  useEffect(() => {
    const fetchAdSets = async () => {
      if (apiService.isMockMode || !selectedCampaignId) return;
      setIsLoadingAdSets(true);
      try {
        const realAdSets = await apiService.getAdSets(String(selectedCampaignId));
        if (realAdSets && realAdSets.length > 0) {
          setAllAdSets(prev => {
            // Replace mock adsets with actual adsets returned from Graph API
            const filtered = prev.filter(as => String(as.campaignId) !== String(selectedCampaignId));
            return [...filtered, ...realAdSets];
          });
        }
      } catch (err) {
        console.error('Failed to dynamically fetch adsets from Meta Graph API:', err);
      } finally {
        setIsLoadingAdSets(false);
      }
    };
    fetchAdSets();
  }, [selectedCampaignId]);

  // Fetch real ads dynamically from API when selected adset changes (non-mock mode)
  useEffect(() => {
    const fetchAds = async () => {
      if (apiService.isMockMode || !selectedAdSetId) return;
      setIsLoadingAds(true);
      try {
        const realAds = await apiService.getAds(selectedAdSetId);
        if (realAds && realAds.length > 0) {
          setAllAds(prev => {
            // Replace mock ads with actual ads returned from Graph API
            const filtered = prev.filter(ad => ad.adsetId !== selectedAdSetId);
            return [...filtered, ...realAds];
          });
        }
      } catch (err) {
        console.error('Failed to dynamically fetch ads from Meta Graph API:', err);
      } finally {
        setIsLoadingAds(false);
      }
    };
    fetchAds();
  }, [selectedAdSetId]);

  // Proportional filter list depending on row checked states and status filter
  const filteredCampaigns = campaigns
    .filter(c => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') return c.active || c.status === 'active';
        if (statusFilter === 'paused') return !c.active && c.status === 'paused';
        if (statusFilter === 'draft') return c.status === 'draft';
        if (statusFilter === 'inactive') return !c.active || c.status !== 'active';
      }
      // Platform filter
      if (platformFilter !== 'all') {
        const plat = String(c.platform || c.channel || '').toLowerCase();
        if (platformFilter === 'meta') return plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram');
        if (platformFilter === 'google') return plat.includes('google') || plat.includes('youtube');
      }
      // Meta-style Custom Date Range Filter
      if (startDate && endDate) {
        const cDate = c.start_date || `${c.year}-${String(c.month).padStart(2, '0')}-15`;
        return cDate >= startDate && cDate <= endDate;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by year then month descending so most recent first
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });

  const { setPageContext } = useAgentStore();
  const activeCampaignCount = campaigns.filter((c: any) => c.active || c.status === 'active').length;
  const sortedBySpend = [...campaigns].sort((a, b) => b.spend - a.spend);
  const topCampaignBySpend = sortedBySpend[0]?.name || 'None';
  
  const sortedByCpc = [...campaigns]
    .filter((c: any) => (c.clicks || 0) > 0)
    .sort((a, b) => (b.spend / (b.clicks || 1)) - (a.spend / (a.clicks || 1)));
  const worstCPC = sortedByCpc[0] ? `${sortedByCpc[0].name} (₹${(sortedByCpc[0].spend / sortedByCpc[0].clicks).toFixed(2)})` : 'None';

  useEffect(() => {
    setPageContext({
      page: 'campaigns',
      data: { activeCampaignCount, topCampaignBySpend, worstCPC }
    });
  }, [activeCampaignCount, topCampaignBySpend, worstCPC, setPageContext]);

  const filteredAdSets = allAdSets.filter(as => {
    // Filter by status filter
    if (statusFilter === 'active' && !as.active) return false;
    if (statusFilter === 'paused' && as.active) return false;
    if (statusFilter === 'inactive' && as.active) return false;

    // Filter by platform filter
    if (platformFilter !== 'all') {
      const parentCamp = campaigns.find(c => String(c.id) === String(as.campaignId));
      if (parentCamp) {
        const plat = String(parentCamp.platform || parentCamp.channel || '').toLowerCase();
        if (platformFilter === 'meta' && !(plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram'))) return false;
        if (platformFilter === 'google' && !(plat.includes('google') || plat.includes('youtube'))) return false;
      }
    }

    // Filter by breadcrumb click
    if (selectedCampaignId && String(as.campaignId) !== String(selectedCampaignId)) {
      return false;
    }
    // Filter by row checkboxes (if checked)
    if (selectedCampaignIds.size > 0 && !selectedCampaignIds.has(as.campaignId)) {
      return false;
    }
    return true;
  });

  const filteredAds = allAds.filter(ad => {
    // Filter by status filter
    if (statusFilter === 'active' && !ad.active) return false;
    if (statusFilter === 'paused' && ad.active) return false;
    if (statusFilter === 'inactive' && ad.active) return false;

    // Filter by platform filter
    if (platformFilter !== 'all') {
      const parentAdSet = allAdSets.find(as => as.id === ad.adsetId);
      const parentCamp = parentAdSet ? campaigns.find(c => String(c.id) === String(parentAdSet.campaignId)) : null;
      if (parentCamp) {
        const plat = String(parentCamp.platform || parentCamp.channel || '').toLowerCase();
        if (platformFilter === 'meta' && !(plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram'))) return false;
        if (platformFilter === 'google' && !(plat.includes('google') || plat.includes('youtube'))) return false;
      }
    }

    // Filter by parent adset breadcrumb
    if (selectedAdSetId && ad.adsetId !== selectedAdSetId) {
      return false;
    }
    // Filter by row checkbox selection of campaign
    const parentAdSet = allAdSets.find(as => as.id === ad.adsetId);
    if (selectedCampaignId && parentAdSet && String(parentAdSet.campaignId) !== String(selectedCampaignId)) {
      return false;
    }
    if (selectedCampaignIds.size > 0 && parentAdSet && !selectedCampaignIds.has(parentAdSet.campaignId)) {
      return false;
    }
    // Filter by row checkbox selection of adsets
    if (selectedAdSetIds.size > 0 && !selectedAdSetIds.has(ad.adsetId)) {
      return false;
    }
    return true;
  });

  // Toggles and status controls
  const toggleCampaign = (id: number | string) => {
    setCampaigns(allCampaigns.map((c: any) => {
      if (String(c.id) === String(id)) {
        toast.success(c.active ? 'Campaign paused' : 'Campaign activated');
        return { ...c, active: !c.active };
      }
      return c;
    }));
  };

  const toggleAdSet = (id: string) => {
    setAllAdSets(prev =>
      prev.map(as => {
        if (as.id === id) {
          toast.success(as.active ? 'Ad set paused' : 'Ad set activated');
          return { ...as, active: !as.active };
        }
        return as;
      })
    );
  };

  const toggleAd = (id: string) => {
    setAllAds(prev =>
      prev.map(ad => {
        if (ad.id === id) {
          toast.success(ad.active ? 'Ad paused' : 'Ad activated');
          return { ...ad, active: !ad.active };
        }
        return ad;
      })
    );
  };

  const deleteCampaign = (id: number) => {
    setCampaigns(allCampaigns.filter((x: any) => x.id !== id));
    setPendingDelete(null);
    setSelectedCampaignIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success('Campaign deleted');
  };

  // Row selection handler helpers
  const handleSelectCampaign = (id: number | string) => {
    setSelectedCampaignIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAdSet = (id: string) => {
    setSelectedAdSetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAd = (id: string) => {
    setSelectedAdIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Header checkbox handler helpers (select all)
  const isAllCampaignsSelected = filteredCampaigns.length > 0 && selectedCampaignIds.size === filteredCampaigns.length;
  const isAllAdSetsSelected = filteredAdSets.length > 0 && selectedAdSetIds.size === filteredAdSets.length;
  const isAllAdsSelected = filteredAds.length > 0 && selectedAdIds.size === filteredAds.length;

  const handleSelectAllCampaigns = () => {
    if (isAllCampaignsSelected) {
      setSelectedCampaignIds(new Set());
    } else {
      setSelectedCampaignIds(new Set(filteredCampaigns.map(c => c.id)));
    }
  };

  const handleSelectAllAdSets = () => {
    if (isAllAdSetsSelected) {
      setSelectedAdSetIds(new Set());
    } else {
      setSelectedAdSetIds(new Set(filteredAdSets.map(as => as.id)));
    }
  };

  const handleSelectAllAds = () => {
    if (isAllAdsSelected) {
      setSelectedAdIds(new Set());
    } else {
      setSelectedAdIds(new Set(filteredAds.map(ad => ad.id)));
    }
  };

  // Bulk actions triggers
  const handleBulkActivate = () => {
    if (activeTab === 'campaigns') {
      setCampaigns(allCampaigns.map(c => selectedCampaignIds.has(c.id) ? { ...c, active: true } : c));
      toast.success(`${selectedCampaignIds.size} Campaigns activated`);
    } else if (activeTab === 'adsets') {
      setAllAdSets(prev => prev.map(as => selectedAdSetIds.has(as.id) ? { ...as, active: true } : as));
      toast.success(`${selectedAdSetIds.size} Ad Groups activated`);
    } else {
      setAllAds(prev => prev.map(ad => selectedAdIds.has(ad.id) ? { ...ad, active: true } : ad));
      toast.success(`${selectedAdIds.size} Ads activated`);
    }
  };

  const handleBulkPause = () => {
    if (activeTab === 'campaigns') {
      setCampaigns(allCampaigns.map(c => selectedCampaignIds.has(c.id) ? { ...c, active: false } : c));
      toast.success(`${selectedCampaignIds.size} Campaigns paused`);
    } else if (activeTab === 'adsets') {
      setAllAdSets(prev => prev.map(as => selectedAdSetIds.has(as.id) ? { ...as, active: false } : as));
      toast.success(`${selectedAdSetIds.size} Ad Groups paused`);
    } else {
      setAllAds(prev => prev.map(ad => selectedAdIds.has(ad.id) ? { ...ad, active: false } : ad));
      toast.success(`${selectedAdIds.size} Ads paused`);
    }
  };

  const handleBulkDelete = () => {
    if (activeTab === 'campaigns') {
      setCampaigns(allCampaigns.filter(c => !selectedCampaignIds.has(c.id)));
      toast.success(`${selectedCampaignIds.size} Campaigns deleted`);
      setSelectedCampaignIds(new Set());
    } else if (activeTab === 'adsets') {
      setAllAdSets(prev => prev.filter(as => !selectedAdSetIds.has(as.id)));
      toast.success(`${selectedAdSetIds.size} Ad Sets deleted`);
      setSelectedAdSetIds(new Set());
    } else {
      setAllAds(prev => prev.filter(ad => !selectedAdIds.has(ad.id)));
      toast.success(`${selectedAdIds.size} Ads deleted`);
      setSelectedAdIds(new Set());
    }
  };

  // Format currencies (INR) and helper calculations
  const formatInr = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const activeCampaignDetails = campaigns.find(c => String(c.id) === String(selectedCampaignId));
  const activeAdSetDetails = allAdSets.find(as => as.id === selectedAdSetId);

  return (
    <PageWrapper>
      {/* ═══════════════════════════════════════════════════════════════════════════════
      BREADCRUMB CONTEXT TRACKING
      // ═══════════════════════════════════════════════════════════════════════════════ */}
      {(selectedCampaignId || selectedAdSetId) && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-4 bg-white border border-slate-100 rounded-xl px-4 py-2.5 shadow-sm">
          <span className="text-slate-400">Filtering:</span>
          <button
            onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); }}
            className="hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0 p-0 text-[11px] font-bold text-slate-700"
          >
            All Campaigns
          </button>
          {activeCampaignDetails && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <button
                onClick={() => setSelectedAdSetId(null)}
                className={`hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0 p-0 text-[11px] font-bold ${selectedAdSetId ? 'text-slate-700' : 'text-indigo-600'}`}
              >
                {activeCampaignDetails.name}
              </button>
            </>
          )}
          {activeAdSetDetails && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-indigo-600 font-bold max-w-56 truncate">{activeAdSetDetails.name}</span>
            </>
          )}
          <button
            onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); }}
            className="ml-auto text-red-500 hover:text-red-700 text-[10px] font-bold cursor-pointer bg-transparent border-0"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════════
      THREE MASTER TABS (CAMPAIGNS / AD SETS / ADS)
      // ═══════════════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4 flex-wrap bg-white rounded-t-2xl p-1 pb-0 shadow-sm border-t border-x border-slate-100">
        {[
          { key: 'campaigns', label: 'Campaigns', count: filteredCampaigns.length, icon: <Folder className="w-4 h-4" /> },
          { key: 'adsets', label: 'Ad sets', count: filteredAdSets.length, icon: <Layers className="w-4 h-4" /> },
          { key: 'ads', label: 'Ads', count: filteredAds.length, icon: <Megaphone className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 h-11 px-5 border-b-2 font-bold text-xs transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════
      ACTION / CRITERIA SUBHEADER (Meta Ads Replica Toolbar)
      // ═══════════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white border-x border-b border-slate-150 p-3 rounded-b-2xl shadow-sm mb-5">
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {activeTab === 'campaigns' && (
            <button
              onClick={() => { setEditingCampaign(null); setShowCampaignModal(true); }}
              className="h-8 px-4 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm cursor-pointer border-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3px]" /> Create
            </button>
          )}

          {/* Bulk Selection Actions Bar */}
          {((activeTab === 'campaigns' && selectedCampaignIds.size > 0) ||
            (activeTab === 'adsets' && selectedAdSetIds.size > 0) ||
            (activeTab === 'ads' && selectedAdIds.size > 0)) && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg">
              <span className="text-[10px] font-bold text-indigo-700">
                {activeTab === 'campaigns' ? selectedCampaignIds.size : activeTab === 'adsets' ? selectedAdSetIds.size : selectedAdIds.size} Selected
              </span>
              <div className="w-px h-4 bg-indigo-200 mx-1" />
              <button onClick={handleBulkActivate} className="text-[10px] font-bold text-slate-700 hover:text-slate-900 cursor-pointer bg-transparent border-0 flex items-center gap-1">
                <Play className="w-3 h-3 text-slate-500" /> Activate
              </button>
              <button onClick={handleBulkPause} className="text-[10px] font-bold text-slate-700 hover:text-slate-900 cursor-pointer bg-transparent border-0 flex items-center gap-1">
                <Pause className="w-3 h-3 text-slate-500" /> Pause
              </button>
              <button onClick={handleBulkDelete} className="text-[10px] font-bold text-red-600 hover:text-red-700 cursor-pointer bg-transparent border-0 flex items-center gap-1">
                <Trash2 className="w-3 h-3 text-red-500" /> Delete
              </button>
              <button
                onClick={() => {
                  setSelectedCampaignIds(new Set());
                  setSelectedAdSetIds(new Set());
                  setSelectedAdIds(new Set());
                }}
                className="text-[10px] font-bold text-slate-400 hover:text-red-600 cursor-pointer bg-transparent border-0 ml-1"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Client context quick pills (Campaign tab only) */}
        {activeTab === 'campaigns' && !selectedClientId && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Clients:</span>
            {clients.map((client: any) => {
              const count = allCampaigns.filter((c: any) => c.clientId === client.id).length;
              return (
                <button key={client.id} onClick={() => setSelectedClientId(client.id)}
                  className={`flex items-center gap-1 h-6 px-2.5 rounded-lg border text-[10px] font-bold transition-all hover:shadow-sm cursor-pointer ${client.lightBg} ${client.lightBorder} ${client.textColor}`}>
                  <span className={`w-1 h-1 rounded-full ${client.dotColor}`}></span>
                  {client.name} <span className="opacity-60 font-semibold">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════
      FILTER & CALENDAR CONTROL TOOLBAR (Meta Ads Style)
      // ═══════════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-2xl shadow-sm mb-4 animate-fade-in">
        {/* Left: Platform & Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Platform Filters */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 p-1 rounded-xl">
            {[
              { id: 'all', label: 'All Platforms' },
              { id: 'meta', label: 'Meta Ads' },
              { id: 'google', label: 'Google Ads' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPlatformFilter(p.id as any)}
                className={`h-7 px-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  platformFilter === p.id
                    ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 p-1 rounded-xl overflow-x-auto">
            {[
              { id: 'all', label: 'All Status' },
              { id: 'active', label: 'Active' },
              { id: 'paused', label: 'Paused' },
            ].map(status => (
              <button
                key={status.id}
                onClick={() => setStatusFilter(status.id as any)}
                className={`h-7 px-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === status.id
                    ? 'bg-indigo-650 text-white shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Calendar Date Range Selector */}
        <div className="relative w-full sm:w-auto self-stretch sm:self-auto flex items-center justify-end">
          <button
            onClick={() => setShowCalendarDropdown(!showCalendarDropdown)}
            className="flex items-center gap-2 h-9 px-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer w-full sm:w-auto justify-center sm:justify-start"
          >
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>{selectedRangeLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCalendarDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Calendar Dropdown Popover */}
          <AnimatePresence>
            {showCalendarDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCalendarDropdown(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 top-11 bg-white border border-slate-200 rounded-2xl shadow-2xl p-0 w-[720px] z-50 flex font-sans overflow-hidden text-slate-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Left Sidebar: Presets */}
                  <div className="w-[180px] border-r border-slate-100 flex flex-col p-3 bg-slate-50/50 justify-between select-none">
                    <div className="flex flex-col gap-1">
                      {[
                        { id: 'today', label: 'Today', start: '2026-05-29', end: '2026-05-29' },
                        { id: 'yesterday', label: 'Yesterday', start: '2026-05-28', end: '2026-05-28' },
                        { id: 'today_yesterday', label: 'Today and yesterday', start: '2026-05-28', end: '2026-05-29' },
                        { id: 'last_7_days', label: 'Last 7 days', start: '2026-05-22', end: '2026-05-28' },
                        { id: 'last_14_days', label: 'Last 14 days', start: '2026-05-15', end: '2026-05-28' },
                        { id: 'last_28_days', label: 'Last 28 days', start: '2026-05-01', end: '2026-05-28' },
                        { id: 'last_30_days', label: 'Last 30 days', start: '2026-04-29', end: '2026-05-28' },
                        { id: 'this_week', label: 'This week', start: '2026-05-24', end: '2026-05-29' },
                        { id: 'last_week', label: 'Last week', start: '2026-05-17', end: '2026-05-23' },
                        { id: 'this_month', label: 'This month', start: '2026-05-01', end: '2026-05-31' },
                        { id: 'last_month', label: 'Last month', start: '2026-04-01', end: '2026-04-30' },
                        { id: 'maximum', label: 'Maximum', start: '2026-01-01', end: '2026-05-29' },
                        { id: 'custom', label: 'Custom' },
                      ].map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setSelectedPreset(preset.id);
                            if (preset.id !== 'custom' && preset.start && preset.end) {
                              setTempStartDate(preset.start);
                              setTempEndDate(preset.end);
                            }
                          }}
                          className="flex items-center gap-2 py-1 px-1.5 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors border-0 bg-transparent cursor-pointer text-left w-full"
                        >
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${selectedPreset === preset.id ? 'border-blue-500 bg-white' : 'border-slate-350 bg-white'}`}>
                            {selectedPreset === preset.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                          </span>
                          <span className={`${selectedPreset === preset.id ? 'font-bold text-blue-600' : ''}`}>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Content: Dual Calendars + Footer */}
                  <div className="flex-1 flex flex-col p-4">
                    {/* Calendars header */}
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight onClick={handlePrevMonth} className="w-3.5 h-3.5 rotate-180 text-slate-400 cursor-pointer hover:text-slate-700 animate-none bg-transparent border-0" />
                        <span>{MONTH_NAMES[leftMonth]} {leftYear}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>{MONTH_NAMES[rightMonth]} {rightYear}</span>
                        <ChevronRight onClick={handleNextMonth} className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-700 animate-none bg-transparent border-0" />
                      </div>
                    </div>

                    {/* Dual Grids */}
                    <div className="grid grid-cols-2 gap-6 select-none">
                      {/* Left Month Calendar */}
                      <div>
                        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
                        </div>
                        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-bold">
                          {getCalendarDays(leftMonth, leftYear).map((day, idx) => {
                            if (day === null) return <span key={`empty-left-${idx}`} />;
                            const dateStr = `${leftYear}-${String(leftMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isSelectedStart = tempStartDate === dateStr;
                            const isSelectedEnd = tempEndDate === dateStr;
                            const isInRange = tempStartDate && tempEndDate && dateStr >= tempStartDate && dateStr <= tempEndDate;

                            return (
                              <button
                                key={`left-${day}`}
                                onClick={() => {
                                  setSelectedPreset('custom');
                                  if (!tempStartDate || (tempStartDate && tempEndDate)) {
                                    setTempStartDate(dateStr);
                                    setTempEndDate('');
                                  } else {
                                    if (dateStr >= tempStartDate) {
                                      setTempEndDate(dateStr);
                                    } else {
                                      setTempStartDate(dateStr);
                                    }
                                  }
                                }}
                                className={`h-6 w-full rounded-md flex items-center justify-center font-bold relative border-0 cursor-pointer ${
                                  isSelectedStart || isSelectedEnd
                                    ? 'bg-blue-600 text-white z-10'
                                    : isInRange
                                    ? 'bg-blue-50 text-blue-700 rounded-none first:rounded-l-md last:rounded-r-md'
                                    : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Month Calendar */}
                      <div>
                        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
                        </div>
                        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-bold">
                          {getCalendarDays(rightMonth, rightYear).map((day, idx) => {
                            if (day === null) return <span key={`empty-right-${idx}`} />;
                            const dateStr = `${rightYear}-${String(rightMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isSelectedStart = tempStartDate === dateStr;
                            const isSelectedEnd = tempEndDate === dateStr;
                            const isInRange = tempStartDate && tempEndDate && dateStr >= tempStartDate && dateStr <= tempEndDate;

                            return (
                              <button
                                key={`right-${day}`}
                                onClick={() => {
                                  setSelectedPreset('custom');
                                  if (!tempStartDate || (tempStartDate && tempEndDate)) {
                                    setTempStartDate(dateStr);
                                    setTempEndDate('');
                                  } else {
                                    if (dateStr >= tempStartDate) {
                                      setTempEndDate(dateStr);
                                    } else {
                                      setTempStartDate(dateStr);
                                    }
                                  }
                                }}
                                className={`h-6 w-full rounded-md flex items-center justify-center font-bold relative border-0 cursor-pointer ${
                                  isSelectedStart || isSelectedEnd
                                    ? 'bg-blue-600 text-white z-10'
                                    : isInRange
                                    ? 'bg-blue-50 text-blue-700 rounded-none'
                                    : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Comparison checkbox & select */}
                    <div className="flex flex-wrap items-center gap-3 mt-4 pt-3.5 border-t border-slate-100">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={compareEnabled}
                          onChange={(e) => setCompareEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <span>Compare</span>
                      </label>
                      <select
                        disabled={!compareEnabled}
                        value={comparePreset}
                        onChange={(e) => setComparePreset(e.target.value)}
                        className="h-8 border border-slate-200 rounded-lg px-2 text-[11px] font-bold text-slate-600 bg-white focus:outline-none disabled:opacity-40 disabled:bg-slate-50 cursor-pointer"
                      >
                        <option value="previous_period">Previous period</option>
                        <option value="previous_year">Previous year</option>
                      </select>

                      {/* Display Date Range in Inputs box style */}
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className="h-8 px-3 border border-slate-200 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-700 bg-slate-50">
                          {tempStartDate ? new Date(tempStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                        </div>
                        <span className="text-slate-400 font-bold">-</span>
                        <div className="h-8 px-3 border border-slate-200 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-700 bg-slate-50">
                          {tempEndDate ? new Date(tempEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                        </div>
                      </div>
                    </div>

                    {/* Footer Row */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 italic font-semibold">
                        Dates are shown in Kolkata Time
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setTempStartDate(startDate);
                            setTempEndDate(endDate);
                            setShowCalendarDropdown(false);
                          }}
                          className="h-8 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (tempStartDate && tempEndDate) {
                              setStartDate(tempStartDate);
                              setEndDate(tempEndDate);
                              
                              const labelStart = new Date(tempStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                              const labelEnd = new Date(tempEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                              setSelectedRangeLabel(`${labelStart} - ${labelEnd}`);
                              
                              // Keep selectedMonth in sync with custom dates for other components
                              const monthStr = tempEndDate.slice(0, 7); // e.g. "2026-05"
                              setSelectedMonth(monthStr);
                              
                              setShowCalendarDropdown(false);
                              toast.success(`Date filter updated: ${labelStart} - ${labelEnd}`);
                            } else {
                              toast.error('Please select both start and end dates.');
                            }
                          }}
                          className="h-8 px-5 bg-blue-600 hover:bg-blue-700 text-white border-0 font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════
      MASTER SPREADSHEET TABLE
      // ═══════════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-['DM_Sans']">
            {/* Table Header */}
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold select-none h-11">
                {/* Checkbox Column */}
                <th className="pl-4 pr-2 w-10 text-center border-r border-slate-100">
                  <button
                    onClick={
                      activeTab === 'campaigns' ? handleSelectAllCampaigns :
                      activeTab === 'adsets' ? handleSelectAllAdSets : handleSelectAllAds
                    }
                    className="flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0"
                  >
                    {
                      activeTab === 'campaigns' ? (isAllCampaignsSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />) :
                      activeTab === 'adsets' ? (isAllAdSetsSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />) :
                      (isAllAdsSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />)
                    }
                  </button>
                </th>
                {/* Serial Number Column */}
                <th className="px-3 py-3 w-12 font-bold border-r border-slate-100 text-center">#</th>
                {/* Dynamic Title Header */}
                <th className="px-4 py-3 font-bold border-r border-slate-150 min-w-80">
                  <div className="flex items-center gap-1 hover:text-slate-800 transition-colors cursor-pointer">
                    {activeTab === 'campaigns' ? 'Campaign Name' : activeTab === 'adsets' ? 'Ad Set Name' : 'Ad Name'}
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </th>
                <th className="px-4 py-3 font-bold border-r border-slate-100">Delivery</th>
                {activeTab === 'campaigns' && (
                  <>
                    <th className="px-4 py-3 font-bold border-r border-slate-100 text-center">Goal</th>
                    <th className="px-4 py-3 font-bold border-r border-slate-100 text-center">Audience</th>
                    <th className="px-4 py-3 font-bold border-r border-slate-100 text-center">Format</th>
                  </>
                )}
                <th className="px-4 py-3 font-bold border-r border-slate-100 text-center">Results (Conversions)</th>
                <th className="px-4 py-3 font-bold border-r border-slate-100 text-center">CTR / Clicks</th>
                <th className="px-4 py-3 font-bold border-r border-slate-100">Budget</th>
                <th className="px-4 py-3 font-bold border-r border-slate-100 text-right">Amount Spent</th>
                <th className="px-4 py-3 font-bold text-center">CPC</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {/* CAMPAIGNS RENDERING */}
              {activeTab === 'campaigns' && (
                filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                      No campaigns found matching filter context.
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((c, index) => {
                    const campaignClient = clients.find((cl: any) => cl.id === c.clientId);
                    const isChecked = selectedCampaignIds.has(c.id);

                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors h-14 ${
                          isChecked ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="pl-4 pr-2 text-center border-r border-slate-100">
                          <button
                            onClick={() => handleSelectCampaign(c.id)}
                            className="flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0"
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Serial Number */}
                        <td className="px-3 py-2.5 border-r border-slate-100 text-center font-bold text-slate-450 font-['JetBrains_Mono']">
                          {index + 1}
                        </td>

                        {/* Campaign Name (Interactive Link) */}
                        <td className="px-4 py-2.5 font-bold border-r border-slate-150">
                          <div className="flex items-start gap-2 max-w-sm">
                            <PlatformDot platform={c.channel} size="sm" className="mt-0.5" />
                            <div className="min-w-0">
                              <a
                                href={getCampaignLink(c, 'adsets')}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  window.open(getCampaignLink(c, 'campaigns'), '_blank');
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-650 hover:text-indigo-800 hover:underline font-bold text-left cursor-pointer block truncate max-w-[280px] p-0 bg-transparent border-0"
                                title="Left-click: View Adsets on Meta | Right-click: View Campaigns on Meta"
                              >
                                {c.name}
                              </a>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {campaignClient && (
                                  <span className={`inline-block text-[9px] font-extrabold tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 ${campaignClient.textColor}`}>
                                    {campaignClient.name}
                                  </span>
                                )}
                                <span className="inline-block text-[9px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                                  Launch: {c.start_date ? new Date(c.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : `${MONTH_NAMES[c.month - 1]} ${c.year}`}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedCampaignId(c.id);
                                    setActiveTab('adsets');
                                    // Auto-check this campaign to restrict scope
                                    setSelectedCampaignIds(new Set([c.id]));
                                  }}
                                  className="text-[9px] font-extrabold text-slate-400 hover:text-indigo-650 hover:bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer bg-white"
                                  title="Filter and view ad sets inside the app"
                                >
                                  <Layers className="w-2.5 h-2.5" /> View in App
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Delivery Status */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              c.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-350'
                            }`} />
                            {c.active ? 'Active' : 'Paused'}
                          </div>
                        </td>

                        {/* Goal */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${getGoalBadgeStyle(c.campaign_target)}`}>
                            {c.campaign_target || 'N/A'}
                          </span>
                        </td>

                        {/* Audience */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${getAudienceBadgeStyle(c.audience_type)}`}>
                            {c.audience_type || 'N/A'}
                          </span>
                        </td>

                        {/* Format */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${getFormatBadgeStyle(c.ad_format)}`}>
                            {c.ad_format || 'N/A'}
                          </span>
                        </td>

                        {/* Results */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{c.conv || 0}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">Leads (Form)</span>
                        </td>

                        {/* CTR / Clicks */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{Number(c.ctr || 0).toFixed(2)}%</p>
                          <span className="text-[10px] text-slate-400 font-semibold font-['JetBrains_Mono']">{c.clicks?.toLocaleString()} clicks</span>
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-600">
                          <p>₹{Math.round(c.budget / 30).toLocaleString('en-IN')}</p>
                          <span className="text-[10px] text-slate-400 font-semibold block">Daily</span>
                        </td>

                        {/* Amount Spent */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-right font-bold text-slate-850 font-['JetBrains_Mono']">
                          {formatInr(c.spend)}
                        </td>

                        {/* CPC */}
                        <td className="px-4 py-2.5 text-center font-bold font-['JetBrains_Mono'] text-indigo-650 bg-indigo-50/5">
                           {c.clicks > 0 ? `₹${(c.spend / c.clicks).toFixed(2)}` : c.cpc ? `₹${c.cpc.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    );
                  })
                )
              )}

              {/* AD SETS RENDERING */}
              {activeTab === 'adsets' && (
                isLoadingAdSets ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-indigo-650 font-bold bg-indigo-50/5 animate-pulse">
                      <div className="flex items-center justify-center gap-2">
                        <Layers className="w-5 h-5 animate-spin" />
                        Fetching real ad sets from Meta Ads Manager...
                      </div>
                    </td>
                  </tr>
                ) : filteredAdSets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                      No Ad Sets found. Click on the "Campaigns" tab to select a campaign first.
                    </td>
                  </tr>
                ) : (
                  filteredAdSets.map((as, index) => {
                    const isChecked = selectedAdSetIds.has(as.id);
                    const isStatusCritical = as.status === 'critical';

                    return (
                      <tr
                        key={as.id}
                        className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors h-14 ${
                          isChecked ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="pl-4 pr-2 text-center border-r border-slate-100">
                          <button
                            onClick={() => handleSelectAdSet(as.id)}
                            className="flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0"
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Serial Number */}
                        <td className="px-3 py-2.5 border-r border-slate-100 text-center font-bold text-slate-450 font-['JetBrains_Mono']">
                          {index + 1}
                        </td>

                        {/* Ad Set Name (Interactive Link) */}
                        <td className="px-4 py-2.5 font-bold border-r border-slate-150">
                          <div className="flex items-start gap-2 max-w-sm">
                            <Layers className="w-3.5 h-3.5 text-violet-500 mt-1" />
                            <div className="min-w-0">
                              <button
                                onClick={() => {
                                  setSelectedAdSetId(as.id);
                                  setActiveTab('ads');
                                  setSelectedAdSetIds(new Set([as.id]));
                                }}
                                className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-left cursor-pointer p-0 bg-transparent border-0 block truncate max-w-[280px]"
                              >
                                {as.name}
                              </button>
                              <span className="inline-block text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                                Campaign: {as.campaignName}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Delivery */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              as.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-350'
                            }`} />
                            {as.active ? 'Active' : 'Paused'}
                          </div>
                        </td>

                        {/* Results */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{as.conv || 0}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">Leads (Form)</span>
                        </td>

                        {/* CTR / Clicks */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{((as.clicks / as.impressions) * 100).toFixed(2)}%</p>
                          <span className="text-[10px] text-slate-400 font-semibold font-['JetBrains_Mono']">{as.clicks?.toLocaleString()} clicks</span>
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-500">
                          Using ad set budget
                        </td>

                        {/* Spend */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-right font-bold text-slate-850 font-['JetBrains_Mono']">
                          {formatInr(as.spend)}
                        </td>

                        {/* CPC */}
                        <td className="px-4 py-2.5 text-center font-bold font-['JetBrains_Mono'] text-indigo-650 bg-indigo-50/5">
                           {as.clicks > 0 ? `₹${(as.spend / as.clicks).toFixed(2)}` : as.cpc ? `₹${as.cpc.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    );
                  })
                )
              )}

              {/* ADS CREATIVE RENDERING */}
              {activeTab === 'ads' && (
                isLoadingAds ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-indigo-650 font-bold bg-indigo-50/5 animate-pulse">
                      <div className="flex items-center justify-center gap-2">
                        <Megaphone className="w-5 h-5 animate-spin" />
                        Fetching active creative assets & insights from Meta Ads Manager...
                      </div>
                    </td>
                  </tr>
                ) : filteredAds.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                      No Creative Ads found. Try selecting an Ad Set first.
                    </td>
                  </tr>
                ) : (
                  filteredAds.map((ad, index) => {
                    const isChecked = selectedAdIds.has(ad.id);
                    const isWarning = ad.status === 'warning';

                    return (
                      <tr
                        key={ad.id}
                        className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors h-14 ${
                          isChecked ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="pl-4 pr-2 text-center border-r border-slate-100">
                          <button
                            onClick={() => handleSelectAd(ad.id)}
                            className="flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer bg-transparent border-0"
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Serial Number */}
                        <td className="px-3 py-2.5 border-r border-slate-100 text-center font-bold text-slate-450 font-['JetBrains_Mono']">
                          {index + 1}
                        </td>

                        {/* Removed On/Off Cell */}

                        {/* Ad Name & Preview */}
                        <td className="px-4 py-2.5 font-bold border-r border-slate-150">
                          <div className="flex items-start gap-3.5 max-w-sm">
                            {ad.imageUrl && !imageErrors[ad.id] ? (
                              <img
                                src={ad.imageUrl}
                                alt={ad.name}
                                onClick={() => setSelectedAdForPreview(ad)}
                                className="w-14 h-9 object-cover rounded-lg flex-shrink-0 shadow-sm border border-slate-100 bg-slate-50 cursor-zoom-in hover:scale-105 active:scale-95 transition-all animate-fade-in"
                                onError={() => {
                                  setImageErrors(prev => ({ ...prev, [ad.id]: true }));
                                }}
                              />
                            ) : (
                              <div 
                                onClick={() => setSelectedAdForPreview(ad)}
                                className={`w-14 h-9 bg-gradient-to-br ${ad.bgGradient || 'from-indigo-500 to-purple-650'} rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-inner border border-slate-100 cursor-zoom-in hover:scale-105 active:scale-95 transition-all`}
                              >
                                <Tv className="w-4 h-4 stroke-[2px]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-slate-800 font-bold truncate max-w-[220px]">{ad.name}</p>
                              <span className="text-[9px] text-slate-450 truncate block mt-0.5 max-w-[220px] font-normal italic">
                                "{ad.headline}"
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Delivery */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              ad.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-350'
                            }`} />
                            {ad.active ? 'Active' : 'Paused'}
                          </div>
                        </td>

                        {/* Results */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{ad.conv || 0}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">Leads (Form)</span>
                        </td>

                        {/* CTR / Clicks */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-center">
                          <p className="font-bold text-slate-800">{Number(ad.ctr || 0).toFixed(2)}%</p>
                          <span className="text-[10px] text-slate-400 font-semibold font-['JetBrains_Mono']">{ad.clicks?.toLocaleString()} clicks</span>
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-2.5 border-r border-slate-100 font-semibold text-slate-500">
                          Using ad set budget
                        </td>

                        {/* Spent */}
                        <td className="px-4 py-2.5 border-r border-slate-100 text-right font-bold text-slate-850 font-['JetBrains_Mono']">
                          {formatInr(ad.spend)}
                        </td>

                        {/* CPC */}
                        <td className="px-4 py-2.5 text-center font-bold font-['JetBrains_Mono'] text-indigo-650 bg-indigo-50/5">
                           {ad.clicks > 0 ? `₹${(ad.spend / ad.clicks).toFixed(2)}` : ad.cpc ? `₹${ad.cpc.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center mb-4"><Trash2 className="w-5 h-5 text-red-600" /></div>
            <h3 className="font-bold text-slate-900 mb-1">Delete Campaign?</h3>
            <p className="text-sm text-slate-500 mb-5">This will permanently remove the campaign. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingDelete(null)} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer">Cancel</button>
              <button onClick={() => deleteCampaign(pendingDelete)} className="flex-1 h-10 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 cursor-pointer">Delete</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Premium Dynamic Ad Creative Lightbox Overlay Modal */}
      <AnimatePresence>
        {selectedAdForPreview && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setSelectedAdForPreview(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl relative border border-slate-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setSelectedAdForPreview(null)}
                className="absolute top-4 right-4 w-9 h-9 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white backdrop-blur-sm transition-all border-0 cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Large Media Container */}
              <div className="relative max-h-[350px] min-h-[220px] w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-100">
                {selectedAdForPreview.imageUrl && !imageErrors[selectedAdForPreview.id] ? (
                  <img 
                    src={selectedAdForPreview.imageUrl} 
                    alt="Creative Preview" 
                    className="w-full h-full max-h-[350px] object-contain"
                    onError={() => {
                      setImageErrors(prev => ({ ...prev, [selectedAdForPreview.id]: true }));
                    }}
                  />
                ) : (
                  <div className={`w-full aspect-video min-h-[220px] max-h-[350px] bg-gradient-to-br ${selectedAdForPreview.bgGradient || 'from-indigo-500 to-purple-650'} flex flex-col items-center justify-center text-white p-6 text-center`}>
                    <Tv className="w-12 h-12 stroke-[1.5px] mb-2 drop-shadow-md animate-pulse" />
                    <p className="text-xs font-bold opacity-80 tracking-wide uppercase">Mock Media Representation</p>
                  </div>
                )}
              </div>

              {/* Copywriting Details */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] font-extrabold tracking-wider uppercase bg-indigo-50 border border-indigo-150 text-indigo-700 px-2 py-0.5 rounded-full">
                    {selectedAdForPreview.imageUrl && !imageErrors[selectedAdForPreview.id] ? 'Meta Graph API Ad Creative' : 'Dynamic Mock Creative'}
                  </span>
                </div>
                
                <h3 className="font-extrabold text-slate-900 text-base leading-tight mb-3">
                  {selectedAdForPreview.name}
                </h3>
                
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4 shadow-inner">
                  <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
                    Headline:
                  </p>
                  <p className="text-slate-800 font-bold text-sm mb-3">
                    {selectedAdForPreview.headline}
                  </p>
                  <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
                    Primary Text (Copy):
                  </p>
                  <p className="text-slate-600 text-xs leading-relaxed font-semibold">
                    {selectedAdForPreview.copy}
                  </p>
                </div>

                {/* Metrics detail inside lightbox */}
                <div className="grid grid-cols-3 gap-2 text-center bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Spend</p>
                    <p className="font-extrabold text-slate-850 mt-0.5 font-['JetBrains_Mono'] text-xs">
                      {formatInr(selectedAdForPreview.spend)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">CTR</p>
                    <p className="font-extrabold text-slate-850 mt-0.5 font-['JetBrains_Mono'] text-xs">
                      {Number(selectedAdForPreview.ctr || 0).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-455 uppercase tracking-wider">CPC</p>
                    <p className="font-extrabold text-indigo-700 mt-0.5 font-['JetBrains_Mono'] text-xs">
                      {selectedAdForPreview.clicks > 0 ? `₹${(selectedAdForPreview.spend / selectedAdForPreview.clicks).toFixed(2)}` : selectedAdForPreview.cpc ? `₹${selectedAdForPreview.cpc.toFixed(2)}` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
}

