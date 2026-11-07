//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, Injector, OnChanges, SimpleChanges, ViewChild, afterNextRender, inject } from '@angular/core';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { HalEventsService } from 'core-app/features/hal/services/hal-events.service';
import { WorkPackageNotificationService } from 'core-app/features/work-packages/services/notifications/work-package-notification.service';
import { UntilDestroyedMixin } from 'core-app/shared/helpers/angular/until-destroyed.mixin';
import { ApiV3Service } from 'core-app/core/apiv3/api-v3.service';
import { RelationResource } from 'core-app/features/hal/resources/relation-resource';
import { WorkPackageRelationsService } from '../wp-relations.service';
import { Highlighting } from 'core-app/features/work-packages/components/wp-fast-table/builders/highlighting/highlighting.functions';
import { ProjectResource } from 'core-app/features/hal/resources/project-resource';
import { Subscription } from 'rxjs';


@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'wp-relation-row',
  templateUrl: './wp-relation-row.template.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkPackageRelationRowComponent extends UntilDestroyedMixin implements OnChanges {
  protected apiV3Service = inject(ApiV3Service);
  protected notificationService = inject(WorkPackageNotificationService);
  protected wpRelations = inject(WorkPackageRelationsService);
  protected halEvents = inject(HalEventsService);
  protected I18n = inject(I18nService);
  protected cdRef = inject(ChangeDetectorRef);
  protected PathHelper = inject(PathHelperService);

  private readonly injector = inject(Injector);
  private relatedWorkPackageSubscription?:Subscription;

  @Input() public workPackage:WorkPackageResource;

  @Input() public relatedWorkPackage:WorkPackageResource;

  @Input() public groupByWorkPackageType:boolean;

  @ViewChild('relationDescriptionTextarea') readonly relationDescriptionTextarea:ElementRef<HTMLTextAreaElement>;

  public relationType:string;

  public showRelationInfo = false;

  public showEditForm = false;

  public availableRelationTypes = RelationResource.LOCALIZED_RELATION_TYPES(false);

  public selectedRelationType:{ name:string };

  public userInputs = {
    newRelationText: '',
    showDescriptionEditForm: false,
    showRelationTypesForm: false,
    showRelationInfo: false,
  };

  // Create a quasi-field object
  public fieldController = {
    handler: {
      active: true,
    },
    required: false,
  };

  public relation:RelationResource;

  public text = {
    cancel: this.I18n.t('js.button_cancel'),
    save: this.I18n.t('js.button_save'),
    removeButton: this.I18n.t('js.relation_buttons.remove'),
    toggleDescription: this.I18n.t('js.relation_buttons.toggle_description'),
    updateRelation: this.I18n.t('js.relation_buttons.update_relation'),
    placeholder: {
      description: this.I18n.t('js.placeholders.relation_description'),
    },
  };

  ngOnChanges(changes:SimpleChanges<WorkPackageRelationRowComponent>):void {
    const relatedWorkPackageChanged = changes.relatedWorkPackage !== undefined
      && changes.relatedWorkPackage.previousValue?.id !== this.relatedWorkPackage.id;
    const previousRelation = this.relation;
    if (changes.relatedWorkPackage && this.relatedWorkPackage.relatedBy) {
      this.relation = this.relatedWorkPackage.relatedBy;
    }

    if (changes.relatedWorkPackage || changes.workPackage) {
      const workPackageChanged = changes.workPackage !== undefined
        && changes.workPackage.previousValue?.id !== this.workPackage.id;
      const rowChanged = relatedWorkPackageChanged || workPackageChanged
        || this.relationIdentity(previousRelation) !== this.relationIdentity(this.relation);

      if (rowChanged || !this.userInputs.showDescriptionEditForm) {
        this.cancelDescriptionEdit();
      }

      if (rowChanged || !this.userInputs.showRelationTypesForm) {
        this.selectedRelationType = this.availableRelationTypes.find((relationType) => relationType.name === this.relation.normalizedType(this.workPackage))!;
        this.userInputs.showRelationTypesForm = false;
      }
    }

    if (!relatedWorkPackageChanged) {
      return;
    }

    this.relatedWorkPackageSubscription?.unsubscribe();
    this.relatedWorkPackageSubscription = this
      .apiV3Service
      .work_packages
      .id(this.relatedWorkPackage)
      .requireAndStream()
      .pipe(
        this.untilDestroyed(),
      ).subscribe((wp) => {
        this.relatedWorkPackage = wp;
        this.cdRef.markForCheck();
      });
  }

  /**
   * Return the normalized relation type for the work package we're viewing.
   * That is, normalize `precedes` where the work package is the `to` link.
   */
  public get normalizedRelationType() {
    const type = this.relation.normalizedType(this.workPackage);
    return this.I18n.t(`js.relation_labels.${type}`);
  }

  public get relationReady() {
    return this.relatedWorkPackage?.$loaded;
  }

  public startDescriptionEdit() {
    this.userInputs.showDescriptionEditForm = true;
    afterNextRender({
      write: () => {
        const textarea = this.relationDescriptionTextarea?.nativeElement;
        if (textarea) {
          const textEnd = textarea.value.length;
          textarea.focus();
          textarea.setSelectionRange(textEnd, textEnd);
        }
      },
    }, { injector: this.injector });
  }

  public handleDescriptionKey(event:KeyboardEvent) {
    if (event.key === 'Escape') {
      this.cancelDescriptionEdit();
    }
  }

  public cancelDescriptionEdit() {
    this.userInputs.showDescriptionEditForm = false;
    this.userInputs.newRelationText = this.relation.description ?? '';
  }

  public saveDescription() {
    const { workPackage, relatedWorkPackage, relation } = this;
    void this.wpRelations.updateRelation(relation, { description: this.userInputs.newRelationText })
      .then((savedRelation) => {
        if (this.applySavedRelation(workPackage, relatedWorkPackage, relation, savedRelation)) {
          this.userInputs.showDescriptionEditForm = false;
          this.cdRef.markForCheck();
        }
        this.notificationService.showSave(relatedWorkPackage);
      });
  }

  public get showDescriptionInfo() {
    return this.userInputs.showRelationInfo || this.relation.description;
  }

  public activateRelationTypeEdit() {
    if (this.groupByWorkPackageType) {
      this.userInputs.showRelationTypesForm = true;
    }
  }

  public cancelRelationTypeEditOnEscape(_evt:KeyboardEvent) {
    this.userInputs.showRelationTypesForm = false;
  }

  public saveRelationType() {
    const { workPackage, relatedWorkPackage, relation } = this;
    this.wpRelations.updateRelationType(workPackage, relatedWorkPackage, relation, this.selectedRelationType.name)
      .then((savedRelation) => {
        this.notificationService.showSave(relatedWorkPackage);
        if (this.applySavedRelation(workPackage, relatedWorkPackage, relation, savedRelation)) {
          this.userInputs.showRelationTypesForm = false;
          this.cdRef.markForCheck();
        }
      })
      .catch((error:unknown) => this.notificationService.handleRawError(error, workPackage));
  }

  private applySavedRelation(
    workPackage:WorkPackageResource,
    relatedWorkPackage:WorkPackageResource,
    original:RelationResource,
    saved:RelationResource,
  ):boolean {
    const relationIdentity = this.relationIdentity(original);
    const isCurrent = this.workPackage.id === workPackage.id
      && this.relatedWorkPackage.id === relatedWorkPackage.id
      && this.relationIdentity(this.relation) === relationIdentity;

    if (!isCurrent) {
      if (this.relationIdentity(relatedWorkPackage.relatedBy) === relationIdentity) {
        relatedWorkPackage.relatedBy = saved;
      }
      return false;
    }

    this.relatedWorkPackage.relatedBy = saved;
    this.relation = saved;
    return true;
  }

  private relationIdentity(relation:RelationResource|null|undefined) {
    return relation?.href ?? relation;
  }

  public toggleUserDescriptionForm() {
    this.userInputs.showDescriptionEditForm = !this.userInputs.showDescriptionEditForm;
  }

  public removeRelation() {
    const { workPackage, relatedWorkPackage, relation } = this;
    this.wpRelations.removeRelation(relation)
      .then(() => {
        this.halEvents.push(workPackage, {
          eventType: 'association',
          relatedWorkPackage: null,
          relationType: relation.normalizedType(workPackage),
        });

        const currentRelatedWorkPackage = this.relatedWorkPackage.id === relatedWorkPackage.id
          ? this.relatedWorkPackage
          : relatedWorkPackage;
        void this.apiV3Service.work_packages.cache.updateWorkPackage(currentRelatedWorkPackage);

        this.wpRelations.updateCounter(workPackage);
        this.notificationService.showSave(relatedWorkPackage);
      })
      .catch((err:unknown) => this.notificationService.handleRawError(err, relatedWorkPackage));
  }

  public highlightingClassForWpType():string {
    return Highlighting.typeClass(this.relatedWorkPackage.type.id!);
  }

  public get relatedWorkPackagePath():string {
    const relatedProject = this.relatedWorkPackage.project as ProjectResource;
    return this.PathHelper.genericWorkPackagePath(
      relatedProject.identifier,
      this.relatedWorkPackage.displayId,
      'relations',
    );
  }
}
