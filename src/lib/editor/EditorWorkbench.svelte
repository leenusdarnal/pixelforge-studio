<script lang="ts">
  import { onMount } from 'svelte';
  import { editorMarkup } from './editorMarkup';
  import { mountEditor } from './engine';
  import './editor.css';

  onMount(() => {
    mountEditor();
  });
</script>

<div class="pixel-forge-editor-root">
  {@html editorMarkup}
</div>
