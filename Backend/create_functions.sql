-- ============================================
-- Funciones RPC de Supabase
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Funcion para votar personas (sin toggle, solo permite 1 voto o cambiar de voto)
CREATE OR REPLACE FUNCTION public.vote_person(
  p_person_id UUID,
  p_type TEXT,
  p_fingerprint TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  existing_vote RECORD;
  person_record RECORD;
BEGIN
  -- Check if user already voted
  SELECT * INTO existing_vote
  FROM buitres_interactions
  WHERE target_id = p_person_id
    AND target_type = 'vote'
    AND author_fingerprint = p_fingerprint;

  IF existing_vote IS NOT NULL THEN
    IF existing_vote.content_snapshot = p_type THEN
      -- Same vote type - reject (ya votaste)
      RAISE EXCEPTION 'Ya has votado por esta persona';
    ELSE
      -- Different vote type - allow switch
      UPDATE buitres_interactions
      SET content_snapshot = p_type
      WHERE id = existing_vote.id;

      IF p_type = 'like' THEN
        UPDATE buitres_people SET likes_count = likes_count + 1, dislikes_count = GREATEST(0, dislikes_count - 1) WHERE id = p_person_id;
      ELSE
        UPDATE buitres_people SET dislikes_count = dislikes_count + 1, likes_count = GREATEST(0, likes_count - 1) WHERE id = p_person_id;
      END IF;
    END IF;
  ELSE
    -- New vote
    INSERT INTO buitres_interactions (target_id, target_type, author_fingerprint, content_snapshot)
    VALUES (p_person_id, 'vote', p_fingerprint, p_type);

    IF p_type = 'like' THEN
      UPDATE buitres_people SET likes_count = likes_count + 1 WHERE id = p_person_id;
    ELSE
      UPDATE buitres_people SET dislikes_count = dislikes_count + 1 WHERE id = p_person_id;
    END IF;
  END IF;

  -- Return updated counts + current vote
  SELECT likes_count, dislikes_count INTO person_record
  FROM buitres_people WHERE id = p_person_id;

  RETURN json_build_object(
    'likes_count', person_record.likes_count,
    'dislikes_count', person_record.dislikes_count,
    'user_vote', p_type
  );
END;
$$;

-- Funcion para fusionar buitres
CREATE OR REPLACE FUNCTION public.merge_buitres(
  p_keep_id UUID,
  p_remove_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE buitres_details SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE buitres_comments SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE buitres_song_notes SET person_id = p_keep_id WHERE person_id = p_remove_id;

  DELETE FROM buitres_people WHERE id = p_remove_id;

  RETURN json_build_object('success', true);
END;
$$;
