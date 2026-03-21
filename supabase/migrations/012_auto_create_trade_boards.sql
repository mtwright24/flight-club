-- Function to auto-create trade boards for user's airline/base/role
-- This ensures every user has a trade board available for their profile settings

CREATE OR REPLACE FUNCTION auto_create_trade_board()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if airline, base, and role are all set
  IF NEW.airline IS NOT NULL AND NEW.airline != '' 
     AND NEW.base IS NOT NULL AND NEW.base != '' 
     AND NEW.role IS NOT NULL AND NEW.role != '' THEN
    
    -- Insert trade board if it doesn't already exist
    INSERT INTO public.trade_boards (airline, base, role, is_active)
    VALUES (NEW.airline, NEW.base, NEW.role, true)
    ON CONFLICT (airline, base, role) DO NOTHING;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profile creation/update
CREATE TRIGGER trigger_auto_create_trade_board
  AFTER INSERT OR UPDATE OF airline, base, role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_trade_board();

-- Also create trade boards for existing users who already have profiles
INSERT INTO public.trade_boards (airline, base, role, is_active)
SELECT DISTINCT 
  p.airline, 
  p.base, 
  p.role,
  true
FROM public.profiles p
WHERE p.airline IS NOT NULL AND p.airline != ''
  AND p.base IS NOT NULL AND p.base != ''
  AND p.role IS NOT NULL AND p.role != ''
ON CONFLICT (airline, base, role) DO NOTHING;
