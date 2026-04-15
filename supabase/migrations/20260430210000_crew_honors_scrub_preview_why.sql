-- Replace legacy preview-seed why_they_won with public-safe copy (UI also sanitizes).

update public.crew_honor_winners w
set why_they_won = 'Recognized for stand-out leadership on the line and consistent excellence supporting the crew.'
where w.why_they_won is not null
  and (
    w.why_they_won ilike '%preview seed%'
    or w.why_they_won ilike '%so you can see home%'
  );

update public.crew_honor_winners w
set short_blurb = 'Stand-out leadership on the line.'
where w.short_blurb is not null
  and w.short_blurb ilike '%preview%'
  and w.short_blurb ilike '%crew honors%';
