"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import {
  getTopicWithChapters,
  getEntities,
  deleteEntity,
  updateEntity,
  createEntity,
} from "@/lib/supabase/queries";
import type { Topic, Entity, EntityType, Chapter } from "@/lib/types";
import {
  ArrowLeft,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Unlink,
  Plus,
  FolderPlus,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";

const STATUS_CONFIG = {
  new: { label: "Nouveau", color: "bg-amber text-white" },
  active: { label: "Actif", color: "bg-teal text-white" },
  solid: { label: "Solide", color: "bg-correct text-white" },
  archived: { label: "Archivé", color: "bg-muted-foreground text-white" },
};

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  single_diagnosis: "Diagnostic",
  ddx_pair: "DDx",
  concept: "Concept",
  protocol: "Protocole",
};

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const topicId = params.topicId as string;

  const [topic, setTopic] = useState<Topic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [groupingId, setGroupingId] = useState<string | null>(null);
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroupLoading, setCreatingGroupLoading] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  const loadData = async () => {
    if (!user) return;
    try {
      const { topic: t, chapters: ch } = await getTopicWithChapters(supabase, topicId);
      setTopic(t);
      setChapters(ch);

      const ents = await getEntities(supabase, user.id);
      const chapterIds = new Set(ch.map((c) => c.id));
      setEntities(ents.filter((e) => chapterIds.has(e.chapter_id)));
    } catch (err) {
      console.error("Topic load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, topicId]);

  // Build hierarchy: parents with children, standalone entities
  const { parents, standalones, childMap } = useMemo(() => {
    const cMap = new Map<string, Entity[]>();
    const childIds = new Set<string>();

    // Group children by parent_id
    for (const e of entities) {
      if (e.parent_id) {
        const list = cMap.get(e.parent_id) || [];
        list.push(e);
        cMap.set(e.parent_id, list);
        childIds.add(e.id);
      }
    }

    // Parents = entities that have children OR are referenced as parent_id
    const parentSet = new Set(cMap.keys());
    const pList = entities.filter((e) => parentSet.has(e.id));
    // Standalone = not a child and not a parent
    const sList = entities.filter((e) => !childIds.has(e.id) && !parentSet.has(e.id));

    return { parents: pList, standalones: sList, childMap: cMap };
  }, [entities]);

  const toggleParent = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (entityId: string) => {
    const isParent = childMap.has(entityId);
    try {
      if (isParent) {
        // Detach children first (set parent_id to null)
        const children = childMap.get(entityId) || [];
        for (const child of children) {
          await updateEntity(supabase, child.id, { parent_id: null } as Partial<Entity>);
        }
      }
      await deleteEntity(supabase, entityId);
      setEntities((prev) => prev.map((e) =>
        e.parent_id === entityId ? { ...e, parent_id: null } : e
      ).filter((e) => e.id !== entityId));
      setDeletingId(null);
      toast.success(isParent ? "Groupe supprimé — sous-entités détachées" : "Entité supprimée");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleEdit = async (entityId: string) => {
    if (!editName.trim()) return;
    try {
      await updateEntity(supabase, entityId, { name: editName.trim() } as Partial<Entity>);
      setEntities((prev) =>
        prev.map((e) => (e.id === entityId ? { ...e, name: editName.trim() } : e))
      );
      setEditingId(null);
      toast.success("Entité modifiée");
    } catch (err) {
      console.error("Edit error:", err);
      toast.error("Erreur lors de la modification");
    }
  };

  const handleDetach = async (childId: string) => {
    try {
      await updateEntity(supabase, childId, { parent_id: null } as Partial<Entity>);
      setEntities((prev) =>
        prev.map((e) => (e.id === childId ? { ...e, parent_id: null } : e))
      );
      toast.success("Entité détachée du groupe");
    } catch (err) {
      console.error("Detach error:", err);
      toast.error("Erreur lors du détachement");
    }
  };

  const handleCreateNewGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    // Find a chapter_id from the first standalone entity in this topic
    const firstEntity = standalones[0] || entities[0];
    if (!firstEntity) return;

    setCreatingGroupLoading(true);
    try {
      const parent = await createEntity(supabase, {
        user_id: user.id,
        chapter_id: firstEntity.chapter_id,
        name: newGroupName.trim(),
        entity_type: firstEntity.entity_type,
        source_id: firstEntity.source_id,
      });
      setEntities((prev) => [...prev, parent]);
      setGroupingId(parent.id);
      setExpandedParents((prev) => new Set([...prev, parent.id]));
      setCreatingGroup(false);
      setNewGroupName("");
      toast.success(`Groupe "${parent.name}" créé — sélectionnez les entités à y ajouter`);
    } catch (err) {
      console.error("Create group error:", err);
      toast.error("Erreur lors de la création du groupe");
    } finally {
      setCreatingGroupLoading(false);
    }
  };

  const handleAddToGroup = async (childId: string, parentId: string) => {
    try {
      await updateEntity(supabase, childId, { parent_id: parentId } as Partial<Entity>);
      setEntities((prev) =>
        prev.map((e) => (e.id === childId ? { ...e, parent_id: parentId } : e))
      );
      toast.success("Ajouté au groupe");
    } catch (err) {
      console.error("Group error:", err);
      toast.error("Erreur");
    }
  };

  const handleAddChild = async (parentId: string) => {
    if (!user || !newChildName.trim()) return;
    const parent = entities.find((e) => e.id === parentId);
    if (!parent) return;

    try {
      const child = await createEntity(supabase, {
        user_id: user.id,
        chapter_id: parent.chapter_id,
        name: newChildName.trim(),
        entity_type: parent.entity_type,
        source_id: parent.source_id,
        parent_id: parentId,
      });
      setEntities((prev) => [...prev, child]);
      setNewChildName("");
      setAddingChildTo(null);
      toast.success("Sous-entité ajoutée");
    } catch (err) {
      console.error("Add child error:", err);
      toast.error("Erreur lors de l'ajout");
    }
  };

  const renderEntityRow = (entity: Entity, indent = false) => {
    const isChild = !!entity.parent_id;
    return (
      <div
        key={entity.id}
        className={`bg-card border border-border overflow-hidden ${indent ? "ml-6 rounded-lg border-l-2 border-l-teal/30" : "rounded-xl"}`}
      >
        {editingId === entity.id ? (
          <div className="px-4 py-3 flex items-center gap-2">
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEdit(entity.id)}
              className="h-10 bg-background border-border flex-1"
            />
            <button
              onClick={() => handleEdit(entity.id)}
              className="p-2 rounded-lg hover:bg-correct/10 text-correct"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="p-2 rounded-lg hover:bg-card text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : deletingId === entity.id ? (
          <div className="px-4 py-3 flex items-center gap-3">
            <p className="text-sm text-wrong flex-1">
              {childMap.has(entity.id)
                ? "Supprimer le groupe ? Les sous-entités seront détachées."
                : "Supprimer cette entité ?"}
            </p>
            <button
              onClick={() => handleDelete(entity.id)}
              className="px-3 py-1.5 rounded-lg bg-wrong text-white text-sm font-medium"
            >
              Supprimer
            </button>
            <button
              onClick={() => setDeletingId(null)}
              className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-sm"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center">
            <Link
              href={`/brief/${entity.id}`}
              className="flex-1 px-4 py-3 flex items-center gap-3 hover:bg-background/50 transition-colors min-w-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {entity.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {ENTITY_TYPE_LABELS[entity.entity_type]}
                  </span>
                  {entity.next_test_date && (
                    <span className="text-xs text-muted-foreground">
                      &middot; Prochain test:{" "}
                      {new Date(entity.next_test_date).toLocaleDateString(
                        "fr-CH",
                        { day: "numeric", month: "short" }
                      )}
                    </span>
                  )}
                  {entity.reference_text && (
                    <span className="text-xs text-teal">&middot; Réf.</span>
                  )}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_CONFIG[entity.status].color}`}
              >
                {STATUS_CONFIG[entity.status].label}
              </span>
            </Link>
            <div className="flex items-center border-l border-border">
              {isChild && (
                <button
                  onClick={() => handleDetach(entity.id)}
                  title="Détacher du groupe"
                  className="p-3 hover:bg-background/50 transition-colors text-muted-foreground hover:text-teal"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setEditingId(entity.id);
                  setEditName(entity.name);
                }}
                className="p-3 hover:bg-background/50 transition-colors text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeletingId(entity.id)}
                className="p-3 hover:bg-wrong/10 transition-colors text-muted-foreground hover:text-wrong"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading || userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Thème non trouvé</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/topics")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">{topic.name}</h1>
            <p className="text-xs text-muted-foreground">
              {entities.length} entité{entities.length !== 1 ? "s" : ""}
              {parents.length > 0 && ` · ${parents.length} groupe${parents.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {chapters.length > 0 && (
          <section className="space-y-1.5 pb-2">
            <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Manuels par chapitre
            </h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {chapters.map((ch) => {
                const hasManual = !!(ch.manual_content && ch.manual_content.trim().length > 0);
                return (
                  <Link
                    key={ch.id}
                    href={`/chapters/${ch.id}/manual`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-background/50 transition-colors"
                  >
                    <BookOpen className={`w-4 h-4 flex-shrink-0 ${hasManual ? "text-teal" : "text-muted-foreground"}`} />
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                      {ch.name}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wider ${hasManual ? "text-teal" : "text-muted-foreground"}`}>
                      {hasManual ? "Manuel" : "Vide"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        {entities.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-muted-foreground">Aucune entité dans ce thème</p>
            <p className="text-sm text-muted-foreground">
              Utilisez le bouton + sur le tableau de bord pour en ajouter.
            </p>
          </div>
        ) : (
          <>
            {/* Parent entities (groups) */}
            {parents.map((parent) => {
              const children = childMap.get(parent.id) || [];
              const isExpanded = expandedParents.has(parent.id);

              return (
                <div key={parent.id} className="space-y-1">
                  {/* Parent header */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    {editingId === parent.id ? (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEdit(parent.id)}
                          className="h-10 bg-background border-border flex-1"
                        />
                        <button onClick={() => handleEdit(parent.id)} className="p-2 rounded-lg hover:bg-correct/10 text-correct">
                          <Check className="w-5 h-5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 rounded-lg hover:bg-card text-muted-foreground">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : deletingId === parent.id ? (
                      <div className="px-4 py-3 flex items-center gap-3">
                        <p className="text-sm text-wrong flex-1">Supprimer le groupe ? Les sous-entités seront détachées.</p>
                        <button onClick={() => handleDelete(parent.id)} className="px-3 py-1.5 rounded-lg bg-wrong text-white text-sm font-medium">Supprimer</button>
                        <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-sm">Annuler</button>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleParent(parent.id)}
                          className="p-3 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <Link
                          href={`/brief/${parent.id}`}
                          className="flex-1 py-3 pr-3 flex items-center gap-3 hover:bg-background/50 transition-colors min-w-0"
                        >
                          <FolderOpen className="w-4 h-4 text-teal shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {parent.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {children.length} sous-entité{children.length !== 1 ? "s" : ""}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[parent.status].color}`}
                              >
                                {STATUS_CONFIG[parent.status].label}
                              </span>
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center border-l border-border">
                          <button
                            onClick={() => {
                              if (groupingId === parent.id) {
                                setGroupingId(null);
                              } else {
                                setGroupingId(parent.id);
                              }
                            }}
                            title={groupingId === parent.id ? "Terminer" : "Ajouter des entités existantes"}
                            className={`p-3 hover:bg-background/50 transition-colors ${groupingId === parent.id ? "text-teal" : "text-muted-foreground hover:text-teal"}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditingId(parent.id); setEditName(parent.name); }}
                            className="p-3 hover:bg-background/50 transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingId(parent.id)}
                            className="p-3 hover:bg-wrong/10 transition-colors text-muted-foreground hover:text-wrong"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Children (when expanded) */}
                  {isExpanded && (
                    <div className="space-y-1">
                      {children.map((child) => renderEntityRow(child, true))}

                      {/* Add new child by name */}
                      {addingChildTo === parent.id ? (
                        <div className="ml-6 bg-card border border-border border-l-2 border-l-teal/30 rounded-lg px-4 py-3 flex items-center gap-2">
                          <Input
                            autoFocus
                            value={newChildName}
                            onChange={(e) => setNewChildName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddChild(parent.id)}
                            placeholder="Nom de la sous-entité..."
                            className="h-10 bg-background border-border flex-1"
                          />
                          <button
                            onClick={() => handleAddChild(parent.id)}
                            disabled={!newChildName.trim()}
                            className="p-2 rounded-lg hover:bg-correct/10 text-correct disabled:opacity-50"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { setAddingChildTo(null); setNewChildName(""); }}
                            className="p-2 rounded-lg hover:bg-card text-muted-foreground"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingChildTo(parent.id)}
                          className="ml-6 w-[calc(100%-1.5rem)] py-2 text-xs text-muted-foreground hover:text-teal bg-card/50 border border-dashed border-border rounded-lg hover:border-teal/30 transition-colors"
                        >
                          + Nouvelle sous-entité
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Create new group button */}
            {standalones.length >= 2 && !groupingId && !creatingGroup && (
              <button
                onClick={() => setCreatingGroup(true)}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm text-teal font-medium bg-teal/5 border border-teal/20 rounded-xl hover:bg-teal/10 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                Créer un nouveau groupe
              </button>
            )}

            {/* New group name input */}
            {creatingGroup && (
              <div className="bg-card border border-teal/30 rounded-xl px-4 py-3 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-teal shrink-0" />
                <Input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateNewGroup()}
                  placeholder="Nom du groupe (ex: Nodules pulmonaires)"
                  className="h-10 bg-background border-border flex-1"
                />
                <button
                  onClick={handleCreateNewGroup}
                  disabled={!newGroupName.trim() || creatingGroupLoading}
                  className="p-2 rounded-lg hover:bg-correct/10 text-correct disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}
                  className="p-2 rounded-lg hover:bg-card text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Grouping mode banner */}
            {groupingId && (
              <div className="bg-teal/5 border border-teal/20 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-teal font-medium">
                  Sélectionnez les entités à ajouter au groupe
                </p>
                <p className="text-xs text-muted-foreground">
                  Cliquez sur &quot;Ajouter&quot; à côté de chaque entité que vous voulez inclure dans le groupe.
                </p>
              </div>
            )}

            {/* Standalone entities */}
            {standalones.map((entity) => (
              <div key={entity.id}>
                {groupingId ? (
                  /* When grouping mode is active, show "add to group" button */
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center">
                      <div className="flex-1 px-4 py-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{entity.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {ENTITY_TYPE_LABELS[entity.entity_type]}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[entity.status].color}`}
                          >
                            {STATUS_CONFIG[entity.status].label}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddToGroup(entity.id, groupingId)}
                        className="px-4 py-3 text-xs text-teal font-medium hover:bg-teal/10 transition-colors border-l border-border whitespace-nowrap"
                      >
                        + Ajouter au groupe
                      </button>
                    </div>
                  </div>
                ) : (
                  renderEntityRow(entity)
                )}
              </div>
            ))}

            {/* Exit grouping mode */}
            {groupingId && (
              <button
                onClick={() => setGroupingId(null)}
                className="w-full py-3 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-background/50 transition-colors"
              >
                Terminer le groupement
              </button>
            )}
          </>
        )}

        {entities.length > 0 && (
          <Button
            onClick={() =>
              router.push(`/session?type=topic_study&topic=${topicId}`)
            }
            className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
          >
            Étudier ce thème
          </Button>
        )}
      </main>
    </div>
  );
}
